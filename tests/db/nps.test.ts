import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, spDateDaysAgo, studentData, type TestOrg, type TestUser } from "./helpers";

type Agg = { enough: boolean; n?: number; average?: number; nps?: number; promoters?: number; passives?: number; detractors?: number };
type Summary = {
  min_n: number; quarter_start: string; headline: Agg;
  quarters: (Agg & { quarter_start: string })[];
  by_trainer: (Agg & { trainer_id: string | null; trainer_name: string })[] | null;
};
type Status = {
  state: string; reason?: string; available_on?: string | null; sessions_done?: number; sessions_needed?: number;
  reminded_at?: string | null; sent?: boolean; already?: boolean;
};
type Prompt = { trainer_first_name: string | null; interval_days: number; reminded: boolean } | null;

const DAY = 86_400_000;

/** Primeiro dia do trimestre anterior ao atual (São Paulo) + 45 dias, ao meio-dia UTC: uma data "no meio" dele. */
function midPreviousQuarter(): string {
  const [y, m] = spDateDaysAgo(0).split("-").map(Number);
  const startMonth = Math.floor((m - 1) / 3) * 3; // 0-based
  const prev = new Date(Date.UTC(y, startMonth - 3, 1, 12));
  return new Date(prev.getTime() + 45 * DAY).toISOString();
}

/**
 * NPS v2 (20261030120000): critérios em private.nps_settings, cartão automático, "Agora não" sem exceção, lembrete em
 * vez de pedido, sem comentário e equipe só com agregados por trimestre fechado (mínimo de respostas).
 */
describe.runIf(dbTestsEnabled)("NPS v2: cartão automático, lembrete e só agregados para a equipe", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, trainer: TestUser, trainer2: TestUser, ownerB: TestUser;
  let alunoOk: TestUser, alunoCedo: TestUser, alunoPoucos: TestUser;
  // sOk: 8 treinos desde 40 dias atrás (apto). sCedo: 3 treinos nos últimos 5 dias. sPoucos: 5 treinos desde 40 dias.
  let sOk: string, sCedo: string, sPoucos: string;

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
  const status = (u: TestUser, id: string) => rpc<Status>(u.client, "get_nps_status", { p_student_id: id });
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

    sOk = await newStudent(alunoOk, trainer.id);
    sCedo = await newStudent(alunoCedo, trainer.id);
    sPoucos = await newStudent(alunoPoucos, trainer.id);
    await addSessions(sOk, trainer, [40, 35, 30, 25, 20, 15, 10, 5]);
    await addSessions(sCedo, trainer, [5, 3, 1]);
    await addSessions(sPoucos, trainer, [40, 30, 20, 10, 2]);
  });
  afterAll(() => fx.cleanup());

  it("anônimo: nenhuma RPC nem leitura das tabelas", async () => {
    const a = anon();
    for (const [fn, args] of [
      ["submit_nps", { p_score: 10 }], ["get_my_nps_prompt", {}], ["snooze_nps_prompt", {}], ["get_nps_summary", {}],
      ["get_nps_status", { p_student_id: sOk }], ["send_nps_reminder", { p_student_id: sOk }], ["request_nps", { p_student_id: sOk }],
    ] as const) {
      await expect(rpc(a, fn, args), fn).rejects.toThrow(/permission denied/);
    }
    for (const table of ["nps_responses", "nps_reminders", "nps_prompts"]) {
      const { error } = await a.from(table).select("*");
      expect(error?.message ?? "", table).toMatch(/permission denied/);
    }
  });

  it("aluno cedo demais ou com poucos treinos: recusado, nada gravado, sem cartão", async () => {
    await expect(rpc(alunoCedo.client, "submit_nps", { p_score: 9 })).rejects.toMatchObject({ message: "NPS_NOT_ELIGIBLE", details: "too_early" });
    await expect(rpc(alunoPoucos.client, "submit_nps", { p_score: 9 })).rejects.toMatchObject({ message: "NPS_NOT_ELIGIBLE", details: "few_sessions" });
    expect(await rpc<Prompt>(alunoCedo.client, "get_my_nps_prompt")).toBeNull();
    expect(await rpc<Prompt>(alunoPoucos.client, "get_my_nps_prompt")).toBeNull();
    expect(await responses(sCedo)).toBe(0);
    expect(await responses(sPoucos)).toBe(0);
  });

  it("equipe não escreve nota (nem pela RPC, nem direto na tabela)", async () => {
    for (const u of [trainer, owner, ownerB]) {
      await expect(rpc(u.client, "submit_nps", { p_score: 10 })).rejects.toThrow("STUDENT_NOT_FOUND");
      const { error } = await u.client.from("nps_responses").insert({ organization_id: org.id, student_id: sOk, score: 10 });
      expect(error?.message ?? "").toMatch(/permission denied/);
    }
    expect(await responses(sOk)).toBe(0);
  });

  it("aluno apto: cartão automático com intervalo da configuração; sem comentário; responde uma vez", async () => {
    const prompt = await rpc<Prompt>(alunoOk.client, "get_my_nps_prompt");
    expect(prompt).toMatchObject({ interval_days: 90, reminded: false });
    expect(prompt?.trainer_first_name).toBeTruthy();
    await expect(rpc(alunoOk.client, "submit_nps", { p_score: 11 })).rejects.toThrow("INVALID_INPUT");
    await expect(rpc(alunoOk.client, "submit_nps", { p_score: 4, p_comment: "texto livre" })).rejects.toMatchObject({ message: "INVALID_INPUT", details: "comment" });
    expect(await responses(sOk)).toBe(0);

    await rpc(alunoOk.client, "submit_nps", { p_score: 4, p_comment: "   " });
    const { data: mine } = await alunoOk.client.from("nps_responses").select("score, comment, trainer_id");
    expect(mine).toEqual([{ score: 4, comment: null, trainer_id: trainer.id }]);

    await expect(rpc(alunoOk.client, "submit_nps", { p_score: 10 })).rejects.toMatchObject({ message: "NPS_NOT_ELIGIBLE", details: "recent_response" });
    expect(await rpc<Prompt>(alunoOk.client, "get_my_nps_prompt")).toBeNull();
    expect((await alunoCedo.client.from("nps_responses").select("id")).data).toEqual([]);
  });

  it("sem UPDATE nem DELETE: nem o aluno, nem a equipe, nem a secret key alteram a resposta", async () => {
    for (const u of [alunoOk, trainer, owner]) {
      await u.client.from("nps_responses").update({ score: 10 }).eq("student_id", sOk);
      await u.client.from("nps_responses").delete().eq("student_id", sOk);
    }
    expect((await fx.db.from("nps_responses").update({ score: 10 }).eq("student_id", sOk)).error).not.toBeNull();
    expect((await fx.db.from("nps_responses").delete().eq("student_id", sOk)).error?.message ?? "").toMatch(/permission denied/);
    expect((await fx.db.from("nps_responses").select("score").eq("student_id", sOk)).data).toEqual([{ score: 4 }]);
  });

  it("90 dias garantidos no banco, mesmo para a secret key", async () => {
    const sB = (await rpc<{ id: string }>(ownerB.client, "create_student", { p_data: studentData() })).id;
    const at = (d: number) => new Date(Date.now() - d * DAY).toISOString();
    expect((await fx.db.from("nps_responses").insert({ organization_id: orgB.id, student_id: sB, score: 8, submitted_at: at(200) })).error).toBeNull();
    expect((await fx.db.from("nps_responses").insert({ organization_id: orgB.id, student_id: sB, score: 8, submitted_at: at(100) })).error).toBeNull();
    const clash = await fx.db.from("nps_responses").insert({ organization_id: orgB.id, student_id: sB, score: 8, submitted_at: at(50) });
    expect(clash.error?.message ?? "").toMatch(/nps_responses_one_per_90_days/);
  });

  it("'Pedir avaliação' antigo (request_nps) sem EXECUTE para a equipe", async () => {
    await expect(rpc(trainer.client, "request_nps", { p_student_id: sPoucos })).rejects.toThrow(/permission denied/);
  });

  it("estado para a equipe: motivo quando ainda não pode; quem respondeu vira 'none', sem data", async () => {
    expect(await status(trainer, sCedo)).toMatchObject({ state: "not_yet", reason: "too_early", sessions_done: 3, sessions_needed: 8 });
    expect(await status(owner, sPoucos)).toMatchObject({ state: "not_yet", reason: "few_sessions", sessions_done: 5, sessions_needed: 8 });
    const answered = await status(trainer, sOk);
    expect(answered).toEqual({ state: "none", reminded_at: null });

    await expect(status(trainer2, sOk)).rejects.toThrow("STUDENT_NOT_FOUND");
    await expect(status(ownerB, sOk)).rejects.toThrow("STUDENT_NOT_FOUND");
    await expect(rpc(alunoOk.client, "get_nps_status", { p_student_id: sOk })).rejects.toThrow("FORBIDDEN");
    for (const u of [trainer2, ownerB, alunoPoucos]) {
      await expect(rpc(u.client, "send_nps_reminder", { p_student_id: sPoucos })).rejects.toThrow("STUDENT_NOT_FOUND");
    }
  });

  it("lembrete: só com o cartão já disponível, um por ciclo; não cria nem antecipa o cartão", async () => {
    // Ainda não apto: nada é gravado.
    expect(await rpc<Status>(trainer.client, "send_nps_reminder", { p_student_id: sPoucos })).toMatchObject({ state: "not_yet", sent: false });
    expect((await fx.db.from("nps_reminders").select("id").eq("student_id", sPoucos)).data).toEqual([]);
    expect(await rpc<Prompt>(alunoPoucos.client, "get_my_nps_prompt")).toBeNull();

    // Apto: o cartão já aparece sozinho; o lembrete só acrescenta a frase. Segundo lembrete no ciclo não duplica.
    await addSessions(sPoucos, trainer, [8, 6, 4]);
    expect(await rpc<Prompt>(alunoPoucos.client, "get_my_nps_prompt")).toMatchObject({ reminded: false });
    expect(await status(trainer, sPoucos)).toEqual({ state: "pending", reminded_at: null });
    expect(await rpc<Status>(trainer.client, "send_nps_reminder", { p_student_id: sPoucos })).toMatchObject({ state: "pending", sent: true, already: false });
    expect(await rpc<Status>(owner.client, "send_nps_reminder", { p_student_id: sPoucos })).toMatchObject({ sent: false, already: true });
    expect((await fx.db.from("nps_reminders").select("id").eq("student_id", sPoucos)).data).toHaveLength(1);
    expect(await rpc<Prompt>(alunoPoucos.client, "get_my_nps_prompt")).toMatchObject({ reminded: true });
    expect((await trainer.client.from("nps_reminders").select("id")).error?.message ?? "").toMatch(/permission denied/);
  });

  it("'Agora não' vale sem exceção e aparece para a equipe só como indisponível, sem data", async () => {
    await rpc(alunoPoucos.client, "snooze_nps_prompt");
    expect(await rpc<Prompt>(alunoPoucos.client, "get_my_nps_prompt")).toBeNull();
    for (const u of [trainer, owner]) {
      const s = await status(u, sPoucos);
      expect(s.state).toBe("unavailable");
      expect(s).not.toHaveProperty("available_on");
      const r = await rpc<Status>(u.client, "send_nps_reminder", { p_student_id: sPoucos });
      expect(r).toMatchObject({ state: "unavailable", sent: false });
      expect(JSON.stringify(r)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    }
    expect(await rpc<Prompt>(alunoPoucos.client, "get_my_nps_prompt")).toBeNull();
    // Responder continua possível (a escolha é dele) e encerra o estado do cartão.
    await rpc(alunoPoucos.client, "submit_nps", { p_score: 9 });
    expect((await fx.db.from("nps_prompts").select("student_id").eq("student_id", sPoucos)).data).toEqual([]);
  });

  it("resumo: só trimestre fechado, só agregado e só com 10+ respostas; nada que identifique o aluno", async () => {
    // As respostas acima são deste trimestre (em aberto): não entram.
    const open = await summary(trainer);
    expect(open.min_n).toBe(10);
    expect(open.headline).toEqual({ enough: false });
    expect(open.by_trainer).toBeNull();
    expect(open.quarters).toHaveLength(4);
    expect(open.quarters.at(-1)?.quarter_start).toBe(open.quarter_start);

    // 10 respostas no trimestre anterior (fechado), em alunos do professor: 6 promotores, 2 neutros, 2 detratores.
    const at = midPreviousQuarter();
    const scores = [10, 10, 9, 9, 9, 10, 8, 7, 2, 4];
    const ids: string[] = [];
    for (const [i, score] of scores.entries()) {
      const sid = await newStudent(null, trainer.id);
      ids.push(sid);
      await fx.db.from("nps_responses").insert({ organization_id: org.id, student_id: sid, trainer_id: trainer.id, score, submitted_at: at });
      const s = await summary(trainer);
      if (i < 9) expect(s.headline, `com ${i + 1} respostas`).toEqual({ enough: false });
    }
    const full = await summary(trainer);
    expect(full.headline).toEqual({ enough: true, n: 10, average: 7.8, nps: 40, promoters: 6, passives: 2, detractors: 2 });
    expect(full.quarters.at(-1)).toMatchObject({ enough: true, n: 10, nps: 40 });
    const text = JSON.stringify(full);
    for (const sid of [...ids, sOk, sPoucos]) expect(text).not.toContain(sid);
    expect(text).not.toMatch(/student|score|comment|Aluno/i);

    const own = await summary(owner);
    expect(own.headline).toMatchObject({ enough: true, n: 10 });
    expect(own.by_trainer).toEqual([expect.objectContaining({ trainer_id: trainer.id, enough: true, n: 10, nps: 40 })]);
    for (const other of [trainer2, ownerB]) expect((await summary(other)).headline).toEqual({ enough: false });
    await expect(rpc(alunoOk.client, "get_nps_summary")).rejects.toThrow("FORBIDDEN");
  });
});
