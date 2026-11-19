import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, spDateDaysAgo, studentData, type TestOrg, type TestUser } from "./helpers";

/**
 * Escritas sensíveis das migrations novas (28–29/10): aluno, anônimo e professor de OUTRA organização nunca mudam a
 * modalidade do aluno, encerram recado ou respondem feedback — nem pela RPC, nem escrevendo direto na tabela. Depois de
 * cada tentativa recusada, o estado é conferido no banco. E a view students_with_status é só leitura, só para logados
 * (20261029120000).
 */
describe.runIf(dbTestsEnabled)("Proteção de escrita: modalidade, recado, resposta ao feedback e students_with_status", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let trainer: TestUser, studentUser: TestUser, trainerB: TestUser;
  let studentId: string, sessionId: string, announcementId: string;

  const modality = async () => (await fx.db.from("students").select("modality").eq("id", studentId).single()).data!.modality;
  const reply = async () => (await fx.db.from("workout_sessions").select("coach_reply").eq("id", sessionId).single()).data!.coach_reply;
  const announcementActive = async () =>
    (await fx.db.from("trainer_announcements").select("active").eq("id", announcementId).single()).data!.active;

  beforeAll(async () => {
    org = await fx.org("wp");
    orgB = await fx.org("wp-b");
    const owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer", "t1");
    studentUser = await fx.user(org, "student", "aluno");
    trainerB = await fx.user(orgB, "trainer", "tb");
    studentId = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    await fx.db.from("students").update({ trainer_id: trainer.id, user_id: studentUser.id }).eq("id", studentId);

    const exercise = (await fx.db.from("exercises").select("id").is("organization_id", null).eq("name", "Abdominal supra").single()).data!.id;
    const planId = await rpc<string>(trainer.client, "save_training_plan", {
      p_plan: {
        student_id: studentId, name: "Plano proteção", starts_on: spDateDaysAgo(30), ends_on: spDateDaysAgo(-30),
        workouts: [{ label: "A", items: [{ exercise_id: exercise, sets: 1, quantity_unit: "reps", quantity_min: 10, quantity_max: 10 }] }],
      },
    });
    await rpc(trainer.client, "activate_plan", { p_plan_id: planId });
    const { data: w } = await fx.db.from("plan_workouts").select("id").eq("plan_id", planId).single();
    const [st] = await rpc<{ session_id: string }[]>(trainer.client, "start_workout_session", { p_plan_id: planId, p_workout_id: w!.id, p_student_id: studentId });
    await rpc(trainer.client, "finish_workout_session", { p_session_id: st.session_id });
    sessionId = st.session_id;
    announcementId = await rpc<string>(trainer.client, "set_trainer_announcement", { p_body: "Recado proteção", p_student_id: studentId });
  });
  afterAll(() => fx.cleanup());

  it("pré-condição: o professor de outra organização é staff de verdade (não falha por falta de perfil)", async () => {
    const { data } = await trainerB.client.from("profiles").select("role, organization_id").eq("id", trainerB.id).single();
    expect(data).toMatchObject({ role: "trainer", organization_id: orgB.id });
  });

  describe("mudar a modalidade do aluno", () => {
    it("aluno (o próprio), anônimo e professor de outra organização são recusados; nada muda", async () => {
      expect(await modality()).toBe("consultoria");
      await expect(rpc(studentUser.client, "set_student_modality", { p_student_id: studentId, p_modality: "presencial" })).rejects.toThrow("STUDENT_NOT_FOUND");
      expect(await modality()).toBe("consultoria");
      await expect(rpc(anon(), "set_student_modality", { p_student_id: studentId, p_modality: "presencial" })).rejects.toThrow(/permission denied/);
      expect(await modality()).toBe("consultoria");
      await expect(rpc(trainerB.client, "set_student_modality", { p_student_id: studentId, p_modality: "presencial" })).rejects.toThrow("STUDENT_NOT_FOUND");
      expect(await modality()).toBe("consultoria");
    });

    it("escrita direta na tabela e pela view também não muda", async () => {
      for (const client of [studentUser.client, anon(), trainerB.client]) {
        await client.from("students").update({ modality: "hibrido" }).eq("id", studentId);
        await client.from("students_with_status").update({ modality: "hibrido" }).eq("id", studentId);
      }
      expect(await modality()).toBe("consultoria");
    });
  });

  describe("encerrar recado", () => {
    it("aluno, anônimo e professor de outra organização são recusados; o recado continua ativo", async () => {
      await expect(rpc(studentUser.client, "end_trainer_announcement", { p_announcement_id: announcementId })).rejects.toThrow("FORBIDDEN");
      expect(await announcementActive()).toBe(true);
      await expect(rpc(anon(), "end_trainer_announcement", { p_announcement_id: announcementId })).rejects.toThrow(/permission denied/);
      expect(await announcementActive()).toBe(true);
      await expect(rpc(trainerB.client, "end_trainer_announcement", { p_announcement_id: announcementId })).rejects.toThrow("ANNOUNCEMENT_NOT_FOUND");
      expect(await announcementActive()).toBe(true);
    });

    it("escrita direta na tabela também não encerra nem apaga", async () => {
      for (const client of [studentUser.client, anon(), trainerB.client]) {
        await client.from("trainer_announcements").update({ active: false }).eq("id", announcementId);
        await client.from("trainer_announcements").delete().eq("id", announcementId);
      }
      expect(await announcementActive()).toBe(true);
    });
  });

  describe("responder feedback", () => {
    it("aluno, anônimo e professor de outra organização são recusados; nenhuma resposta gravada", async () => {
      await expect(rpc(studentUser.client, "reply_to_session", { p_session_id: sessionId, p_reply: "x" })).rejects.toThrow("FORBIDDEN");
      expect(await reply()).toBeNull();
      await expect(rpc(anon(), "reply_to_session", { p_session_id: sessionId, p_reply: "x" })).rejects.toThrow(/permission denied/);
      expect(await reply()).toBeNull();
      await expect(rpc(trainerB.client, "reply_to_session", { p_session_id: sessionId, p_reply: "x" })).rejects.toThrow("SESSION_NOT_FOUND");
      expect(await reply()).toBeNull();
    });

    it("escrita direta na tabela também não grava resposta", async () => {
      for (const client of [studentUser.client, anon(), trainerB.client]) {
        await client.from("workout_sessions").update({ coach_reply: "x" }).eq("id", sessionId);
      }
      expect(await reply()).toBeNull();
    });

    it("controle: o professor responsável responde (a recusa acima não é falha geral)", async () => {
      await rpc(trainer.client, "reply_to_session", { p_session_id: sessionId, p_reply: "Boa!" });
      expect(await reply()).toBe("Boa!");
    });
  });

  describe("students_with_status: só leitura, só para logados (20261029120000)", () => {
    it("anônimo não lê", async () => {
      const { data, error } = await anon().from("students_with_status").select("id").eq("id", studentId);
      expect(error?.message ?? "").toMatch(/permission denied/);
      expect(data ?? []).toEqual([]);
    });

    it("logado lê pelo RLS: o responsável vê o aluno; outra organização não", async () => {
      expect((await trainer.client.from("students_with_status").select("id").eq("id", studentId)).data).toHaveLength(1);
      expect((await trainerB.client.from("students_with_status").select("id").eq("id", studentId)).data).toEqual([]);
    });

    it("ninguém escreve pela view — nem o responsável, nem a secret key", async () => {
      for (const [who, client] of [["responsável", trainer.client], ["secret key", fx.db]] as const) {
        const upd = await client.from("students_with_status").update({ first_name: "Hack" }).eq("id", studentId);
        expect(upd.error?.message ?? "", `${who}: update`).toMatch(/permission denied|READ_ONLY_VIEW/);
        const del = await client.from("students_with_status").delete().eq("id", studentId);
        expect(del.error?.message ?? "", `${who}: delete`).toMatch(/permission denied|READ_ONLY_VIEW/);
        const ins = await client.from("students_with_status").insert({ organization_id: org.id, first_name: "X", last_name: "Y", email: "x@example.com" });
        expect(ins.error?.message ?? "", `${who}: insert`).toMatch(/permission denied|READ_ONLY_VIEW/);
      }
      const { data } = await fx.db.from("students").select("first_name, deleted_at").eq("id", studentId).single();
      expect(data).toMatchObject({ first_name: "Aluno", deleted_at: null });
    });
  });
});
