import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IMPORT_DECLARATION_VERSION } from "@/features/import/declaration";
import { anon, dbTestsEnabled, Fixture, rpc, spDateDaysAgo, studentData, type TestOrg, type TestUser } from "./helpers";

/**
 * PARTE 0 (migration 20261124120000): Perfil do aluno com "Treino atual" (nome + válido até) e "Plano" (ciclo/valor do
 * cadastro + próximo pagamento). Só o próprio aluno recebe; nunca outro aluno nem histórico. Ciclo/valor só pela equipe
 * com acesso (`set_student_billing`) e na importação.
 */
interface Summary {
  today: string;
  training: { name: string; valid_until: string | null; no_end: boolean } | null;
  billing: { cycle: string; amount_cents: number | null } | null;
  next_payment: { amount_cents: number; due_date: string } | null;
}

describe.runIf(dbTestsEnabled)("Perfil do aluno: Treino atual e Plano", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, trainer: TestUser, trainer2: TestUser, ownerB: TestUser;
  let alunoA: TestUser, alunoB: TestUser, alunoNada: TestUser, alunoSoPagamento: TestUser;
  let sA: string, sB: string, sPay: string;

  const mk = async (ownerUser: TestUser, user: TestUser | null) => {
    const id = (await rpc<{ id: string }>(ownerUser.client, "create_student", { p_data: studentData() })).id;
    if (user) await fx.db.from("students").update({ user_id: user.id }).eq("id", id);
    return id;
  };
  const plan = async (o: TestOrg, studentId: string, name: string, endsIn: number | null) => {
    const { error } = await fx.db.from("training_plans").insert({
      organization_id: o.id, student_id: studentId, name, status: "active", starts_on: spDateDaysAgo(20),
      ends_on: endsIn === null ? null : spDateDaysAgo(-endsIn), no_end: endsIn === null,
    });
    if (error) throw error;
  };
  const pay = async (o: TestOrg, studentId: string, cents: number, dueInDays: number, status: "pending" | "paid") => {
    const { error } = await fx.db.from("payments").insert({
      organization_id: o.id, student_id: studentId, amount_cents: cents, due_date: spDateDaysAgo(-dueInDays), status,
      ...(status === "paid" ? { paid_at: new Date().toISOString() } : {}),
    });
    if (error) throw error;
  };
  const mine = (u: TestUser) => rpc<Summary | null>(u.client, "get_my_plan_summary");
  const billing = (u: TestUser, id: string, cycle: string | null, cents: number | null) =>
    rpc(u.client, "set_student_billing", { p_student_id: id, p_cycle: cycle, p_amount_cents: cents });

  beforeAll(async () => {
    org = await fx.org("myplan");
    orgB = await fx.org("myplan-b");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer");
    trainer2 = await fx.user(org, "trainer", "t2");
    ownerB = await fx.user(orgB, "owner", "ob");
    alunoA = await fx.user(org, "student", "a");
    alunoB = await fx.user(org, "student", "b");
    alunoNada = await fx.user(org, "student", "nada");
    alunoSoPagamento = await fx.user(org, "student", "pag");
    sA = await mk(owner, alunoA);
    sB = await mk(owner, alunoB);
    await mk(owner, alunoNada);
    sPay = await mk(owner, alunoSoPagamento);
    await fx.db.from("students").update({ trainer_id: trainer.id }).eq("id", sA);
    await plan(org, sA, "Hipertrofia ABC", 12);
    await plan(org, sB, "Plano do B", null);
    await pay(org, sA, 15000, -30, "paid");
    await pay(org, sA, 24990, 5, "pending");
    await pay(org, sA, 26000, 35, "pending");
    await pay(org, sB, 99900, 2, "pending");
    await pay(org, sPay, 18000, -3, "pending");
  });
  afterAll(() => fx.cleanup());

  it("ciclo e valor: equipe com acesso grava; professor sem acesso, outra conta, aluno e anônimo não", async () => {
    await billing(trainer, sA, "monthly", 24990);
    await expect(billing(trainer2, sA, "annual", 1)).rejects.toThrow("STUDENT_NOT_FOUND");
    await expect(billing(ownerB, sA, "annual", 1)).rejects.toThrow("STUDENT_NOT_FOUND");
    await expect(billing(alunoA, sA, "annual", 1)).rejects.toThrow("FORBIDDEN");
    expect((await anon().rpc("set_student_billing", { p_student_id: sA, p_cycle: "annual", p_amount_cents: 1 })).error).not.toBeNull();
    await expect(billing(owner, sA, "weekly", 100)).rejects.toThrow("INVALID_INPUT");
    await expect(billing(owner, sA, "monthly", 0)).rejects.toThrow("INVALID_INPUT");
    // Escrita direta na coluna: sem permissão.
    await owner.client.from("students").update({ billing_cycle: "annual" }).eq("id", sA);
    const { data } = await fx.db.from("students").select("billing_cycle, plan_amount_cents").eq("id", sA).single();
    expect(data).toEqual({ billing_cycle: "monthly", plan_amount_cents: 24990 });
    // Sem mudança → nada novo na auditoria.
    await billing(owner, sA, "monthly", 24990);
    const { count } = await fx.db.from("audit_logs").select("id", { count: "exact", head: true }).eq("entity_id", sA).eq("action", "student.billing_updated");
    expect(count).toBe(1);
  });

  it("aluno vê 'Treino atual' (válido até) e 'Plano' (ciclo, valor e só o próximo pagamento)", async () => {
    const a = (await mine(alunoA))!;
    expect(a.training).toEqual({ name: "Hipertrofia ABC", starts_on: spDateDaysAgo(20), valid_until: spDateDaysAgo(-12), no_end: false });
    expect(a.billing).toEqual({ cycle: "monthly", amount_cents: 24990 });
    expect(a.next_payment).toEqual({ amount_cents: 24990, due_date: spDateDaysAgo(-5) });
    const raw = JSON.stringify(a);
    expect(raw).not.toContain("15000"); // histórico pago
    expect(raw).not.toContain("26000"); // pagamento seguinte
    expect(raw).not.toContain("99900"); // outro aluno
    expect(raw).not.toContain("Plano do B");
  });

  it("sem ciclo cadastrado: só o próximo pagamento; sem treino: bloco de treino nulo; nada → null", async () => {
    const p = (await mine(alunoSoPagamento))!;
    expect(p.training).toBeNull();
    expect(p.billing).toBeNull();
    expect(p.next_payment).toEqual({ amount_cents: 18000, due_date: spDateDaysAgo(3) });
    const b = (await mine(alunoB))!;
    expect(b.training).toMatchObject({ name: "Plano do B", valid_until: null, no_end: true });
    expect(b.billing).toBeNull();
    expect(await mine(alunoNada)).toBeNull();
  });

  it("equipe e anônimo não leem pelo resumo do aluno; aluno sem acesso ativo não recebe", async () => {
    await expect(mine(owner)).rejects.toThrow("STUDENT_NOT_FOUND");
    expect((await anon().rpc("get_my_plan_summary")).error).not.toBeNull();
    await fx.db.from("students").update({ status: "inactive" }).eq("id", sB);
    expect(await mine(alunoB)).toBeNull();
    await fx.db.from("students").update({ status: "active" }).eq("id", sB);
  });

  it("importação: ciclo e valor opcionais entram no cadastro; valor inválido recusa só a linha", async () => {
    const batch = await rpc<string>(owner.client, "start_import_batch", { p_source_label: "teste", p_declaration_version: IMPORT_DECLARATION_VERSION, p_rows_expected: 3 });
    const tag = Date.now().toString(36);
    const r = await rpc<{ created: number; results: { row: number; ok: boolean; error?: string; student_id?: string }[] }>(owner.client, "import_students", {
      p_batch_id: batch,
      p_rows: [
        { row: 2, first_name: "Imp", last_name: "Um", email: `imp1-${tag}@example.com`, status: "active", billing_cycle: "quarterly", plan_amount_cents: 59990 },
        { row: 3, first_name: "Imp", last_name: "Dois", email: `imp2-${tag}@example.com`, status: "active" },
        { row: 4, first_name: "Imp", last_name: "Tres", email: `imp3-${tag}@example.com`, status: "active", billing_cycle: "weekly" },
      ],
    });
    expect(r.created).toBe(2);
    expect(r.results.find((x) => x.row === 4)).toMatchObject({ ok: false, error: "INVALID_INPUT" });
    const one = r.results.find((x) => x.row === 2)!.student_id!;
    const two = r.results.find((x) => x.row === 3)!.student_id!;
    const { data } = await fx.db.from("students").select("id, billing_cycle, plan_amount_cents").in("id", [one, two]);
    expect(data!.find((s) => s.id === one)).toMatchObject({ billing_cycle: "quarterly", plan_amount_cents: 59990 });
    expect(data!.find((s) => s.id === two)).toMatchObject({ billing_cycle: null, plan_amount_cents: null });
  });
});
