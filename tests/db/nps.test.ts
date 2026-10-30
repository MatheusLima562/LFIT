import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, spDateDaysAgo, studentData, type TestOrg, type TestUser } from "./helpers";

type Summary = {
  n: number; promoters: number; passives: number; detractors: number; nps: number | null; min_n: number;
  quarters: { quarter_start: string; n: number; nps: number | null }[];
  detractor_list: { student_id: string; student_name: string; score: number; comment: string | null; comment_hidden: boolean }[];
  by_trainer: { trainer_id: string | null; n: number; nps: number | null }[] | null;
};
type Check = { eligible: boolean; reason: string | null; available_on?: string | null; sessions_done?: number; requested?: boolean; already?: boolean };

const DAY = 86_400_000;

/**
 * NPS identificado (20261029130000): só o próprio aluno responde, com 30 dias de uso e 8+ treinos concluídos, uma vez a
 * cada 90 dias (garantido no banco). Resumo: professor só os seus, owner a organização + por professor, NPS só com
 * n >= 10, comentário de detrator só para quem vê a saúde.
 */
describe.runIf(dbTestsEnabled)("NPS identificado do aluno para o professor", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, trainer: TestUser, trainer2: TestUser, ownerB: TestUser;
  let alunoOk: TestUser, alunoCedo: TestUser, alunoPoucos: TestUser;
  // sOk: 8 treinos desde 40 dias atrás (apto). sCedo: 3 treinos nos últimos 5 dias. sPoucos: 5 treinos desde 40 dias.
  let sOk: string, sCedo: string, sPoucos: string;
  const COMMENT = "Comentário NPS de teste — joelho incomodou";

  const addSessions = async (studentId: string, by: TestUser, daysAgo: number[]) => {
    const exercise = (await fx.db.from("exercises").select("id").is("organization_id", null).eq("name", "Abdominal supra").single()).data!.id;
    let { data: plan } = await fx.db.from("training_plans").select("id").eq("student_id", studentId).eq("status", "active").maybeSingle();
    if (!plan) {
      const planId = await rpc<string>(by.client, "save_training_plan", {
        p_plan: {
          student_id: studentId, name: "Plano NPS", starts_on: spDateDaysAgo(60), ends_on: spDateDaysAgo(-30),
          workouts: [{ label: "A", items: [{ exercise_id: exercise, sets: 1, quantity_unit: "reps", quantity_min: 10, quantity_max: 10 }] }],
        },
      });
      await rpc(by.client, "activate_plan", { p_plan_id: planId });
      plan = { id: planId };
    }
    const { data: w } = await fx.db.from("plan_workouts").select("id, label").eq("plan_id", plan.id).limit(1).single();
    const { data: st } = await fx.db.from("students").select("organization_id").eq("id", studentId).single();
    const rows = daysAgo.map((d) => {
      const at = new Date(Date.now() - d * DAY).toISOString();
      return {
        organization_id: st!.organization_id, student_id: studentId, plan_id: plan!.id, workout_id: w!.id, workout_label: w!.label,
        snapshot: {}, status: "completed", started_at: at, finished_at: at,
      };
    });
    const { error } = await fx.db.from("workout_sessions").insert(rows);
    if (error) throw error;
  };

  const newStudent = async (user: TestUser | null, trainerId: string | null) => {
    const id = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    await fx.db.from("students").update({ trainer_id: trainerId, ...(user ? { user_id: user.id } : {}) }).eq("id", id);
    return id;
  };

  const summary = (u: TestUser) => rpc<Summary>(u.client, "get_nps_summary");
  const responses = async (studentId: string) => (await fx.db.from("nps_responses").select("id").eq("student_id", studentId)).data!.length;

  beforeAll(async () => {
    org = await fx.org("nps");
    orgB = await fx.org("nps-b");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer", "t1");
    trainer2 = await fx.user(org, "trainer", "t2");
    alunoOk = await fx.user(org, "student", "ok");
    alunoCedo = await fx.user(org, "student", "cedo");
    alunoPoucos = await fx.user(org, "student", "poucos");
    ownerB = await fx.user(orgB, "owner");

    // Consentimento de saúde NÃO confirmado pelo titular: o owner acessa o aluno mas não vê a saúde; o responsável vê.
    sOk = await newStudent(alunoOk, trainer.id);
    sCedo = await newStudent(alunoCedo, trainer.id);
    sPoucos = await newStudent(alunoPoucos, trainer.id);
    await addSessions(sOk, trainer, [40, 35, 30, 25, 20, 15, 10, 5]);
    await addSessions(sCedo, trainer, [5, 3, 1]);
    await addSessions(sPoucos, trainer, [40, 30, 20, 10, 2]);
  });
  afterAll(() => fx.cleanup());

  it("anônimo: nenhuma RPC nem leitura da tabela", async () => {
    const a = anon();
    for (const [fn, args] of [
      ["submit_nps", { p_score: 10 }], ["get_my_nps_prompt", {}], ["snooze_nps_prompt", {}], ["get_nps_summary", {}], ["request_nps", { p_student_id: sOk }],
    ] as const) {
      await expect(rpc(a, fn, args), fn).rejects.toThrow(/permission denied/);
    }
    const { error } = await a.from("nps_responses").select("id");
    expect(error?.message ?? "").toMatch(/permission denied/);
  });

  it("aluno cedo demais (menos de 30 dias de uso) ou com poucos treinos: recusado, nada gravado, sem cartão", async () => {
    await expect(rpc(alunoCedo.client, "submit_nps", { p_score: 9 })).rejects.toMatchObject({ message: "NPS_NOT_ELIGIBLE", details: "too_early" });
    await expect(rpc(alunoPoucos.client, "submit_nps", { p_score: 9 })).rejects.toMatchObject({ message: "NPS_NOT_ELIGIBLE", details: "few_sessions" });
    expect(await rpc(alunoCedo.client, "get_my_nps_prompt")).toBeNull();
    expect(await rpc(alunoPoucos.client, "get_my_nps_prompt")).toBeNull();
    expect(await responses(sCedo)).toBe(0);
    expect(await responses(sPoucos)).toBe(0);
  });

  it("professor e owner não escrevem nota (nem pela RPC, nem direto na tabela)", async () => {
    for (const u of [trainer, owner, ownerB]) {
      await expect(rpc(u.client, "submit_nps", { p_score: 10 })).rejects.toThrow("STUDENT_NOT_FOUND");
      const { error } = await u.client.from("nps_responses").insert({ organization_id: org.id, student_id: sOk, score: 10 });
      expect(error?.message ?? "").toMatch(/permission denied/);
    }
    expect(await responses(sOk)).toBe(0);
  });

  it("aluno apto: vê o cartão com o primeiro nome do professor, responde uma vez; a segunda é recusada", async () => {
    const prompt = await rpc<{ trainer_first_name: string } | null>(alunoOk.client, "get_my_nps_prompt");
    expect(prompt?.trainer_first_name).toBeTruthy();
    await expect(rpc(alunoOk.client, "submit_nps", { p_score: 11 })).rejects.toThrow("INVALID_INPUT");
    await expect(rpc(alunoOk.client, "submit_nps", { p_score: 4, p_comment: "x".repeat(301) })).rejects.toThrow("INVALID_INPUT");

    await rpc(alunoOk.client, "submit_nps", { p_score: 4, p_comment: `  ${COMMENT}  ` });
    const { data: mine } = await alunoOk.client.from("nps_responses").select("score, comment, trainer_id");
    expect(mine).toEqual([{ score: 4, comment: COMMENT, trainer_id: trainer.id }]);

    await expect(rpc(alunoOk.client, "submit_nps", { p_score: 10 })).rejects.toMatchObject({ message: "NPS_NOT_ELIGIBLE", details: "recent_response" });
    expect(await rpc(alunoOk.client, "get_my_nps_prompt")).toBeNull();
    expect(await responses(sOk)).toBe(1);
    // Outro aluno não lê a resposta (RLS).
    expect((await alunoCedo.client.from("nps_responses").select("id")).data).toEqual([]);
  });

  it("sem UPDATE nem DELETE: nem o aluno, nem a equipe, nem a secret key alteram a resposta", async () => {
    for (const u of [alunoOk, trainer, owner]) {
      await u.client.from("nps_responses").update({ score: 10 }).eq("student_id", sOk);
      await u.client.from("nps_responses").delete().eq("student_id", sOk);
    }
    const upd = await fx.db.from("nps_responses").update({ score: 10 }).eq("student_id", sOk);
    expect(upd.error).not.toBeNull();
    const del = await fx.db.from("nps_responses").delete().eq("student_id", sOk);
    expect(del.error?.message ?? "").toMatch(/permission denied/);
    const { data } = await fx.db.from("nps_responses").select("score").eq("student_id", sOk);
    expect(data).toEqual([{ score: 4 }]);
  });

  it("90 dias garantidos no banco: mesmo a secret key não grava duas respostas a menos de 90 dias", async () => {
    const sB = (await rpc<{ id: string }>(ownerB.client, "create_student", { p_data: studentData() })).id;
    const at = (d: number) => new Date(Date.now() - d * DAY).toISOString();
    expect((await fx.db.from("nps_responses").insert({ organization_id: orgB.id, student_id: sB, score: 8, submitted_at: at(200) })).error).toBeNull();
    expect((await fx.db.from("nps_responses").insert({ organization_id: orgB.id, student_id: sB, score: 8, submitted_at: at(100) })).error).toBeNull();
    const clash = await fx.db.from("nps_responses").insert({ organization_id: orgB.id, student_id: sB, score: 8, submitted_at: at(50) });
    expect(clash.error?.message ?? "").toMatch(/nps_responses_one_per_90_days/);
    // A organização vem do aluno, não do que foi enviado.
    const forged = await fx.db.from("nps_responses").insert({ organization_id: org.id, student_id: sB, score: 1, submitted_at: at(400) }).select("organization_id").single();
    expect(forged.data?.organization_id).toBe(orgB.id);
  });

  it("resumo: professor vê os seus; comentário só para quem vê a saúde; outro professor e outra organização não veem", async () => {
    const mine = await summary(trainer);
    expect(mine).toMatchObject({ n: 1, detractors: 1, nps: null, min_n: 10, by_trainer: null });
    expect(mine.detractor_list).toEqual([expect.objectContaining({ student_id: sOk, score: 4, comment: COMMENT, comment_hidden: false })]);

    expect(await rpc<boolean>(owner.client, "can_view_student_health", { p_student_id: sOk })).toBe(false);
    const own = await summary(owner);
    expect(own.detractor_list).toEqual([expect.objectContaining({ student_id: sOk, score: 4, comment: null, comment_hidden: true })]);
    expect(own.by_trainer).toEqual([expect.objectContaining({ trainer_id: trainer.id, n: 1, nps: null })]);

    for (const other of [trainer2, ownerB]) {
      const s = await summary(other);
      expect(s.n).toBe(0);
      expect(JSON.stringify(s)).not.toContain(COMMENT);
      expect(s.detractor_list).toEqual([]);
    }
    await expect(rpc(alunoOk.client, "get_nps_summary")).rejects.toThrow("FORBIDDEN");
  });

  it("NPS só aparece com 10+ respostas e entra na tendência do trimestre", async () => {
    // 9 respostas a mais nos alunos do professor (secret key): 6 promotores, 2 neutros, 1 detrator.
    const scores = [10, 10, 9, 9, 9, 10, 8, 7, 2];
    for (const [i, score] of scores.entries()) {
      const sid = await newStudent(null, trainer.id);
      await fx.db.from("nps_responses").insert({ organization_id: org.id, student_id: sid, trainer_id: trainer.id, score });
      const s = await summary(trainer);
      expect(s.n).toBe(i + 2);
      expect(s.nps).toBe(i + 2 >= 10 ? 40 : null); // (6 − 2) / 10 = 40
    }
    const s = await summary(trainer);
    expect(s).toMatchObject({ promoters: 6, passives: 2, detractors: 2 });
    expect(s.quarters).toHaveLength(4);
    expect(s.quarters.at(-1)).toMatchObject({ n: 10, nps: 40 });
  });

  it("pedir avaliação: owner ou responsável, um aluno por vez, com o motivo quando ainda não pode", async () => {
    expect(await rpc<Check>(trainer.client, "request_nps", { p_student_id: sCedo })).toMatchObject({ requested: false, reason: "too_early", sessions_done: 3 });
    expect(await rpc<Check>(trainer.client, "request_nps", { p_student_id: sPoucos })).toMatchObject({ requested: false, reason: "few_sessions", sessions_done: 5 });
    const recent = await rpc<Check>(owner.client, "request_nps", { p_student_id: sOk });
    expect(recent).toMatchObject({ requested: false, reason: "recent_response" });
    expect(recent.available_on).toBe(spDateDaysAgo(-90));

    for (const u of [trainer2, ownerB, alunoPoucos]) {
      await expect(rpc(u.client, "request_nps", { p_student_id: sPoucos })).rejects.toThrow("STUDENT_NOT_FOUND");
    }

    // sPoucos passa a ter 8 treinos: apto. "Agora não" esconde; o pedido do professor faz o cartão voltar.
    await addSessions(sPoucos, trainer, [8, 6, 4]);
    expect(await rpc(alunoPoucos.client, "get_my_nps_prompt")).not.toBeNull();
    await rpc(alunoPoucos.client, "snooze_nps_prompt");
    expect(await rpc(alunoPoucos.client, "get_my_nps_prompt")).toBeNull();
    expect(await rpc<Check>(trainer.client, "request_nps", { p_student_id: sPoucos })).toMatchObject({ requested: true, already: false });
    expect(await rpc<Check>(owner.client, "request_nps", { p_student_id: sPoucos })).toMatchObject({ requested: true, already: true });
    expect(await rpc(alunoPoucos.client, "get_my_nps_prompt")).not.toBeNull();
    // Equipe não lê nem escreve o estado do cartão diretamente.
    expect((await trainer.client.from("nps_prompts").select("student_id")).error?.message ?? "").toMatch(/permission denied/);
    // Respondeu: pedido some.
    await rpc(alunoPoucos.client, "submit_nps", { p_score: 9 });
    expect((await fx.db.from("nps_prompts").select("student_id").eq("student_id", sPoucos)).data).toEqual([]);
  });

  it("comentário nunca em audit_logs", async () => {
    const { data } = await fx.db.from("audit_logs").select("diff, action").eq("organization_id", org.id);
    expect(JSON.stringify(data ?? [])).not.toContain("joelho incomodou");
  });
});
