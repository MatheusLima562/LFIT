import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, spDateDaysAgo, studentData, type TestOrg, type TestUser } from "./helpers";

/**
 * PARTE 0 (migration 20261124120000): "Meu plano" no Perfil do aluno. Só o próprio aluno recebe; nunca outro aluno,
 * nunca histórico de pagamentos (só o próximo em aberto); sem plano ativo → null (o bloco não aparece).
 */
interface MyPlan {
  name: string; starts_on: string | null; ends_on: string | null; no_end: boolean; today: string;
  next_payment: { amount_cents: number; due_date: string } | null;
}

describe.runIf(dbTestsEnabled)("Meu plano (Perfil do aluno)", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, alunoA: TestUser, alunoB: TestUser, alunoSemPlano: TestUser, alunoOutraOrg: TestUser;
  let sA: string, sB: string;

  const mk = async (o: TestOrg, ownerUser: TestUser, user: TestUser) => {
    const id = (await rpc<{ id: string }>(ownerUser.client, "create_student", { p_data: studentData() })).id;
    await fx.db.from("students").update({ user_id: user.id }).eq("id", id);
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
  const mine = (u: TestUser) => rpc<MyPlan | null>(u.client, "get_my_plan_summary");

  beforeAll(async () => {
    org = await fx.org("myplan");
    orgB = await fx.org("myplan-b");
    owner = await fx.user(org, "owner");
    const ownerB = await fx.user(orgB, "owner", "ob");
    alunoA = await fx.user(org, "student", "a");
    alunoB = await fx.user(org, "student", "b");
    alunoSemPlano = await fx.user(org, "student", "sem");
    alunoOutraOrg = await fx.user(orgB, "student", "outra");
    sA = await mk(org, owner, alunoA);
    sB = await mk(org, owner, alunoB);
    await mk(org, owner, alunoSemPlano);
    const sOutra = await mk(orgB, ownerB, alunoOutraOrg);
    await plan(org, sA, "Consultoria Hipertrofia", 12);
    await plan(org, sB, "Plano do B", null);
    await plan(orgB, sOutra, "Plano da outra conta", 3);
    // A: um pago (histórico) e dois em aberto — só o de vencimento mais antigo aparece.
    await pay(org, sA, 15000, -30, "paid");
    await pay(org, sA, 18000, 5, "pending");
    await pay(org, sA, 19000, 35, "pending");
    await pay(org, sB, 99900, 2, "pending");
  });
  afterAll(() => fx.cleanup());

  it("aluno vê só o próprio plano: nome, vencimento e o próximo valor em aberto", async () => {
    const a = await mine(alunoA);
    expect(a).toMatchObject({ name: "Consultoria Hipertrofia", ends_on: spDateDaysAgo(-12), no_end: false });
    expect(a!.next_payment).toEqual({ amount_cents: 18000, due_date: spDateDaysAgo(-5) });
    // Nada de histórico nem de outro aluno.
    const raw = JSON.stringify(a);
    expect(raw).not.toContain("15000");
    expect(raw).not.toContain("19000");
    expect(raw).not.toContain("99900");
    expect(raw).not.toContain("Plano do B");
  });

  it("plano sem vencimento; outro aluno não vê o do A", async () => {
    const b = await mine(alunoB);
    expect(b).toMatchObject({ name: "Plano do B", ends_on: null, no_end: true });
    expect(JSON.stringify(b)).not.toContain("Consultoria Hipertrofia");
  });

  it("sem plano ativo → null; outra organização isolada", async () => {
    expect(await mine(alunoSemPlano)).toBeNull();
    const o = await mine(alunoOutraOrg);
    expect(o!.name).toBe("Plano da outra conta");
    expect(JSON.stringify(o)).not.toContain("Consultoria");
  });

  it("equipe e anônimo não usam (não é RPC de consulta de aluno)", async () => {
    await expect(mine(owner)).rejects.toThrow("STUDENT_NOT_FOUND");
    const { error } = await anon().rpc("get_my_plan_summary");
    expect(error).not.toBeNull();
  });

  it("aluno sem acesso ativo não recebe o bloco", async () => {
    await fx.db.from("students").update({ status: "inactive" }).eq("id", sB);
    expect(await mine(alunoB)).toBeNull();
    await fx.db.from("students").update({ status: "active" }).eq("id", sB);
  });
});
