import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, studentData, type TestOrg, type TestUser } from "./helpers";

/**
 * Nota de satisfação no fim do treino (migration 20261017120000): `rate_workout_session` grava 1–5 SOMENTE para o aluno
 * dono da sessão e SOMENTE em sessão concluída. As sessões são criadas direto pela secret key (a RPC só depende da linha).
 */
describe.runIf(dbTestsEnabled)("nota de satisfação da sessão (rate_workout_session)", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, trainer: TestUser, studentUser: TestUser, otherUser: TestUser, studentB: TestUser;
  let s1: string, s2: string, sB: string;
  let done: string, open: string, doneOther: string, doneB: string;

  const session = async (orgId: string, studentId: string, completed: boolean) => {
    const now = new Date().toISOString();
    const { data, error } = await fx.db
      .from("workout_sessions")
      .insert({
        organization_id: orgId, student_id: studentId, workout_label: "A", snapshot: {},
        status: completed ? "completed" : "in_progress", finished_at: completed ? now : null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  };
  const rate = (user: TestUser, sessionId: string, rating: unknown) =>
    rpc(user.client, "rate_workout_session", { p_session_id: sessionId, p_rating: rating });
  const ratingOf = async (sessionId: string) =>
    (await fx.db.from("workout_sessions").select("student_rating").eq("id", sessionId).single()).data!.student_rating;

  beforeAll(async () => {
    org = await fx.org("rating");
    orgB = await fx.org("rating-b");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer");
    studentUser = await fx.user(org, "student", "aluno");
    otherUser = await fx.user(org, "student", "outro");
    const ownerB = await fx.user(orgB, "owner", "ob");
    studentB = await fx.user(orgB, "student", "alunob");

    s1 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    s2 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    sB = (await rpc<{ id: string }>(ownerB.client, "create_student", { p_data: studentData() })).id;
    await fx.db.from("students").update({ trainer_id: trainer.id, user_id: studentUser.id }).eq("id", s1);
    await fx.db.from("students").update({ trainer_id: trainer.id, user_id: otherUser.id }).eq("id", s2);
    await fx.db.from("students").update({ user_id: studentB.id }).eq("id", sB);

    done = await session(org.id, s1, true);
    open = await session(org.id, s1, false);
    doneOther = await session(org.id, s2, true);
    doneB = await session(orgB.id, sB, true);
  });
  afterAll(() => fx.cleanup());

  it("o aluno dá nota à própria sessão concluída e pode trocar", async () => {
    expect(await ratingOf(done)).toBeNull();
    await rate(studentUser, done, 4);
    expect(await ratingOf(done)).toBe(4);
    await rate(studentUser, done, 5);
    expect(await ratingOf(done)).toBe(5);
    // O titular lê a própria nota (RLS de workout_sessions).
    const { data } = await studentUser.client.from("workout_sessions").select("student_rating").eq("id", done).single();
    expect(data!.student_rating).toBe(5);
  });

  it("fora de 1 a 5 ou nula: INVALID_INPUT, sem mudar a nota", async () => {
    for (const bad of [0, 6, -1, null]) await expect(rate(studentUser, done, bad)).rejects.toThrow("INVALID_INPUT");
    expect(await ratingOf(done)).toBe(5);
  });

  it("sessão que não está concluída: INVALID_INPUT", async () => {
    await expect(rate(studentUser, open, 3)).rejects.toThrow("INVALID_INPUT");
    expect(await ratingOf(open)).toBeNull();
  });

  it("sessão alheia, inexistente, de outro tenant ou chamada pelo staff: STUDENT_NOT_FOUND", async () => {
    await expect(rate(otherUser, done, 1)).rejects.toThrow("STUDENT_NOT_FOUND");
    await expect(rate(studentUser, doneOther, 1)).rejects.toThrow("STUDENT_NOT_FOUND");
    await expect(rate(studentB, done, 1)).rejects.toThrow("STUDENT_NOT_FOUND");
    await expect(rate(studentUser, doneB, 1)).rejects.toThrow("STUDENT_NOT_FOUND");
    await expect(rate(studentUser, randomUUID(), 1)).rejects.toThrow("STUDENT_NOT_FOUND");
    // O professor (inclusive no modo presencial) não avalia pelo aluno.
    await expect(rate(trainer, done, 1)).rejects.toThrow("STUDENT_NOT_FOUND");
    await expect(rate(owner, done, 1)).rejects.toThrow("STUDENT_NOT_FOUND");
    // Fora do intervalo E alheia: não revela a sessão (o dono vem antes do intervalo).
    await expect(rate(otherUser, done, 9)).rejects.toThrow("STUDENT_NOT_FOUND");
    expect(await ratingOf(done)).toBe(5);
    expect(await ratingOf(doneOther)).toBeNull();
    expect(await ratingOf(doneB)).toBeNull();
  });

  it("anônimo não executa", async () => {
    const { error } = await anon().rpc("rate_workout_session", { p_session_id: done, p_rating: 3 });
    expect(error).not.toBeNull();
    expect(await ratingOf(done)).toBe(5);
  });

  it("a escrita direta na tabela segue fechada (só pela RPC)", async () => {
    await studentUser.client.from("workout_sessions").update({ student_rating: 1 }).eq("id", done);
    expect(await ratingOf(done)).toBe(5);
  });

  it("nada da nota em audit_logs", async () => {
    const { data } = await fx.db.from("audit_logs").select("action, diff").eq("organization_id", org.id);
    expect((data ?? []).some((l) => String(l.action).includes("rating") || JSON.stringify(l.diff ?? {}).includes("student_rating"))).toBe(false);
  });
});
