import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, spDateDaysAgo, studentData, type TestOrg, type TestUser } from "./helpers";
import { CLI_TIMEOUT_MS, sqlLinked, uuidLiteral } from "./linked-sql";

/**
 * Aluno ausente e pausa (1.5, migration 20261120150000): "Sem treinar há 7+ dias" no Início (com a frequência prevista do
 * plano), pausa (motivo sem saúde) tira da lista e do aviso, aviso ao aluno no máximo 1 vez a cada 7 dias.
 */
interface Inactive { student_id: string; days_since: number; threshold_days: number }

describe.runIf(dbTestsEnabled)("ausência e pausa", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, trainer: TestUser, trainer2: TestUser, studentUser: TestUser, ownerB: TestUser;
  let gone: string, recent: string, sparse: string, noPlan: string, ofT2: string;

  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  const mk = async (trainerId: string, userId: string | null = null) => {
    const id = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    await fx.db.from("students").update({ trainer_id: trainerId, user_id: userId }).eq("id", id);
    return id;
  };
  const plan = async (studentId: string, startsDaysAgo: number, endsInDays: number, sessions: number | null) => {
    const { error } = await fx.db.from("training_plans").insert({
      organization_id: org.id, student_id: studentId, name: "Plano", status: "active",
      starts_on: spDateDaysAgo(startsDaysAgo), ends_on: spDateDaysAgo(-endsInDays), planned_sessions: sessions,
    });
    if (error) throw error;
  };
  const session = async (studentId: string, startedDaysAgo: number) => {
    const { error } = await fx.db.from("workout_sessions").insert({
      organization_id: org.id, student_id: studentId, workout_label: "A", snapshot: {}, status: "completed",
      started_at: daysAgo(startedDaysAgo), finished_at: daysAgo(startedDaysAgo),
    });
    if (error) throw error;
  };
  const inactive = (u: TestUser) => rpc<Inactive[]>(u.client, "get_inactive_students");
  const ids = async (u: TestUser) => (await inactive(u)).map((i) => i.student_id);

  beforeAll(async () => {
    org = await fx.org("abs");
    orgB = await fx.org("abs-b");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer");
    trainer2 = await fx.user(org, "trainer", "t2");
    studentUser = await fx.user(org, "student", "aluno");
    ownerB = await fx.user(orgB, "owner", "ob");
    gone = await mk(trainer.id, studentUser.id);
    recent = await mk(trainer.id);
    sparse = await mk(trainer.id);
    noPlan = await mk(trainer.id);
    ofT2 = await mk(trainer2.id);
    await plan(gone, 60, 30, 36);      // ~2,5 dias por sessão → limite 7
    await plan(recent, 60, 30, 36);
    await plan(sparse, 60, 30, 9);     // 91 dias / 9 sessões ≈ 10,1 → limite ceil(15,2) = 16
    await plan(ofT2, 60, 30, 36);
    await session(gone, 10);
    await session(recent, 2);
    await session(sparse, 10);
    await session(ofT2, 12);
    await session(noPlan, 30);
  });
  afterAll(() => fx.cleanup());

  it("lista quem passou do limite; respeita a frequência prevista; sem plano ativo não entra", async () => {
    const list = await inactive(owner);
    const g = list.find((i) => i.student_id === gone);
    expect(g).toMatchObject({ days_since: 10, threshold_days: 7 });
    const all = list.map((i) => i.student_id);
    expect(all).not.toContain(recent);
    expect(all).not.toContain(sparse); // 10 dias, mas o plano prevê ~1 sessão a cada 10 dias (limite 16)
    expect(all).not.toContain(noPlan);
    expect(all).toContain(ofT2);
    expect(JSON.stringify(list)).not.toMatch(/pain|feedback|group|condition/);
  });

  it("escopo: professor vê só os dele; outra organização e aluno não veem", async () => {
    const t1 = await ids(trainer);
    expect(t1).toContain(gone);
    expect(t1).not.toContain(ofT2);
    expect(await ids(ownerB)).toHaveLength(0);
    await expect(inactive(studentUser)).rejects.toThrow("FORBIDDEN");
    await expect(rpc(anon(), "get_inactive_students")).rejects.toThrow();
  });

  it("aviso ao aluno: aparece uma vez e não volta antes de 7 dias", async () => {
    const first = await rpc<{ show: boolean; days_since?: number }>(studentUser.client, "claim_my_nudge");
    expect(first).toEqual({ show: true, days_since: 10 });
    expect(await rpc(studentUser.client, "claim_my_nudge")).toEqual({ show: false });
  });

  it("pausa: motivo da lista fixa, volta de hoje em diante; tira da lista; só quem acessa o aluno", async () => {
    await expect(rpc(trainer.client, "set_student_pause", { p_student_id: gone, p_reason: "lesão", p_until: null })).rejects.toThrow("INVALID_INPUT");
    await expect(rpc(trainer.client, "set_student_pause", { p_student_id: gone, p_reason: "viagem", p_until: spDateDaysAgo(1) })).rejects.toThrow("INVALID_INPUT");
    await expect(rpc(trainer.client, "set_student_pause", { p_student_id: ofT2, p_reason: "viagem", p_until: null })).rejects.toThrow("STUDENT_NOT_FOUND");
    await expect(rpc(ownerB.client, "set_student_pause", { p_student_id: gone, p_reason: "viagem", p_until: null })).rejects.toThrow("STUDENT_NOT_FOUND");
    await rpc(trainer.client, "set_student_pause", { p_student_id: gone, p_reason: "ferias", p_until: spDateDaysAgo(-10) });
    expect(await ids(owner)).not.toContain(gone);
    const { data } = await trainer.client.from("student_pauses").select("reason, until").eq("student_id", gone);
    expect(data).toEqual([{ reason: "ferias", until: spDateDaysAgo(-10) }]);
    // Outra organização não lê a pausa.
    expect((await ownerB.client.from("student_pauses").select("student_id").eq("student_id", gone)).data ?? []).toHaveLength(0);
  });

  it("em pausa: sem aviso no app, mesmo com o último aviso há mais de 7 dias", async () => {
    // Último aviso "esquecido" (tabela fora da API): só a pausa pode segurar o aviso agora.
    sqlLinked(`delete from private.student_nudges where student_id = ${uuidLiteral(gone)};`);
    expect(await rpc(studentUser.client, "claim_my_nudge")).toEqual({ show: false });
  }, CLI_TIMEOUT_MS * 2);

  it("pausa vencida volta a contar; encerrar pausa também", async () => {
    await fx.db.from("student_pauses").update({ until: spDateDaysAgo(1) }).eq("student_id", gone);
    expect(await ids(owner)).toContain(gone);
    await rpc(trainer.client, "set_student_pause", { p_student_id: gone, p_reason: "outro", p_until: null });
    expect(await ids(owner)).not.toContain(gone);
    await rpc(owner.client, "end_student_pause", { p_student_id: gone });
    expect(await ids(owner)).toContain(gone);
    const { data: audit } = await fx.db.from("audit_logs").select("action").eq("organization_id", org.id).in("action", ["student.paused", "student.pause_ended"]);
    expect((audit ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
