import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, spDateDaysAgo, studentData, type TestOrg, type TestUser } from "./helpers";

type Row = Record<string, unknown>;

describe.runIf(dbTestsEnabled)("3.3 enxuta: resposta ao feedback com saúde no servidor e encerrar recado", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, trainer: TestUser, trainer2: TestUser, studentUser: TestUser, ownerB: TestUser;
  // s1: professor responsável = trainer, consentimento de saúde não confirmado pelo titular → o owner acessa o aluno
  // mas NÃO vê a saúde. s2: sem professor → o owner é quem vê a saúde.
  let s1: string, s2: string;
  let session1: string, session2: string;

  const finishedSession = async (studentId: string, by: TestUser) => {
    const exercise = (await fx.db.from("exercises").select("id").is("organization_id", null).eq("name", "Abdominal supra").single()).data!.id;
    const planId = await rpc<string>(by.client, "save_training_plan", {
      p_plan: {
        student_id: studentId, name: "Plano 3.3", starts_on: spDateDaysAgo(30), ends_on: spDateDaysAgo(-30),
        workouts: [{ label: "A", items: [{ exercise_id: exercise, sets: 1, quantity_unit: "reps", quantity_min: 10, quantity_max: 10 }] }],
      },
    });
    await rpc(by.client, "activate_plan", { p_plan_id: planId });
    const { data: w } = await fx.db.from("plan_workouts").select("id").eq("plan_id", planId).single();
    const [st] = await rpc<{ session_id: string }[]>(by.client, "start_workout_session", { p_plan_id: planId, p_workout_id: w!.id, p_student_id: studentId });
    await rpc(by.client, "finish_workout_session", { p_session_id: st.session_id });
    return st.session_id;
  };

  beforeAll(async () => {
    org = await fx.org("c33");
    orgB = await fx.org("c33-b");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer", "t1");
    trainer2 = await fx.user(org, "trainer", "t2");
    studentUser = await fx.user(org, "student", "aluno");
    ownerB = await fx.user(orgB, "owner");
    s1 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    s2 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    await fx.db.from("students").update({ trainer_id: trainer.id, user_id: studentUser.id }).eq("id", s1);
    await fx.db.from("students").update({ trainer_id: null }).eq("id", s2);
    session1 = await finishedSession(s1, trainer);
    session2 = await finishedSession(s2, owner);
  });
  afterAll(() => fx.cleanup());

  it("pré-condição: owner acessa s1 mas não vê a saúde; responsável vê", async () => {
    expect(await rpc<boolean>(owner.client, "can_view_student_health", { p_student_id: s1 })).toBe(false);
    expect(await rpc<boolean>(trainer.client, "can_view_student_health", { p_student_id: s1 })).toBe(true);
    expect(await rpc<boolean>(owner.client, "can_view_student_health", { p_student_id: s2 })).toBe(true);
  });

  it("reply_to_session: só quem vê a saúde responde — regra no servidor", async () => {
    // Owner sem acesso à saúde: recusado como se a sessão não existisse (nada gravado).
    await expect(rpc(owner.client, "reply_to_session", { p_session_id: session1, p_reply: "Boa!" })).rejects.toThrow("SESSION_NOT_FOUND");
    expect((await fx.db.from("workout_sessions").select("coach_reply").eq("id", session1).single()).data!.coach_reply).toBeNull();
    // Professor sem acesso ao aluno, outra organização, aluno e anônimo.
    await expect(rpc(trainer2.client, "reply_to_session", { p_session_id: session1, p_reply: "x" })).rejects.toThrow("SESSION_NOT_FOUND");
    await expect(rpc(ownerB.client, "reply_to_session", { p_session_id: session1, p_reply: "x" })).rejects.toThrow("SESSION_NOT_FOUND");
    await expect(rpc(studentUser.client, "reply_to_session", { p_session_id: session1, p_reply: "x" })).rejects.toThrow(/FORBIDDEN/);
    await expect(rpc(anon(), "reply_to_session", { p_session_id: session1, p_reply: "x" })).rejects.toThrow();
    // Quem vê a saúde responde: responsável em s1, owner em s2 (sem professor).
    await rpc(trainer.client, "reply_to_session", { p_session_id: session1, p_reply: "Mandou bem!" });
    await rpc(owner.client, "reply_to_session", { p_session_id: session2, p_reply: "Boa sessão." });
    expect((await fx.db.from("workout_sessions").select("coach_reply").eq("id", session1).single()).data!.coach_reply).toBe("Mandou bem!");
    expect((await fx.db.from("workout_sessions").select("coach_reply").eq("id", session2).single()).data!.coach_reply).toBe("Boa sessão.");
  });

  it("end_trainer_announcement: só o autor encerra; depois disso o aluno não vê mais o recado", async () => {
    const id = await rpc<string>(trainer.client, "set_trainer_announcement", { p_body: "Recado 3.3 do professor", p_student_id: s1 });
    expect((await rpc<Row | null>(studentUser.client, "get_my_announcement"))?.id).toBe(id);

    for (const other of [owner, trainer2, ownerB]) {
      await expect(rpc(other.client, "end_trainer_announcement", { p_announcement_id: id })).rejects.toThrow("ANNOUNCEMENT_NOT_FOUND");
    }
    await expect(rpc(studentUser.client, "end_trainer_announcement", { p_announcement_id: id })).rejects.toThrow(/FORBIDDEN/);
    await expect(rpc(anon(), "end_trainer_announcement", { p_announcement_id: id })).rejects.toThrow();
    expect((await rpc<Row | null>(studentUser.client, "get_my_announcement"))?.id).toBe(id);

    await rpc(trainer.client, "end_trainer_announcement", { p_announcement_id: id });
    expect((await rpc<Row | null>(studentUser.client, "get_my_announcement"))?.id ?? null).toBeNull();
    await expect(rpc(trainer.client, "end_trainer_announcement", { p_announcement_id: id })).rejects.toThrow("ANNOUNCEMENT_NOT_FOUND");
  });

  it("recado para todos: o autor encerra o próprio; outro staff não", async () => {
    // Recado para todos novo sai pelo Feed (1.6): a RPC recusa. Os antigos (linhas já gravadas) continuam encerráveis.
    await expect(rpc(owner.client, "set_trainer_announcement", { p_body: "Recado geral do owner" })).rejects.toThrow("INVALID_INPUT");
    const { data: row, error } = await fx.db
      .from("trainer_announcements")
      .insert({ organization_id: org.id, trainer_id: owner.id, student_id: null, body: "Recado geral do owner" })
      .select("id")
      .single();
    if (error) throw error;
    const id = row.id as string;
    await expect(rpc(trainer.client, "end_trainer_announcement", { p_announcement_id: id })).rejects.toThrow("ANNOUNCEMENT_NOT_FOUND");
    await rpc(owner.client, "end_trainer_announcement", { p_announcement_id: id });
    expect((await fx.db.from("trainer_announcements").select("active").eq("id", id).single()).data!.active).toBe(false);
  });

  it("nenhum texto de recado ou resposta em audit_logs", async () => {
    const { data } = await fx.db.from("audit_logs").select("diff, action").eq("organization_id", org.id);
    const text = JSON.stringify(data ?? []);
    for (const body of ["Mandou bem!", "Boa sessão.", "Recado 3.3 do professor", "Recado geral do owner"]) expect(text).not.toContain(body);
  });
});
