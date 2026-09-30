import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, spDateDaysAgo, studentData, type TestOrg, type TestUser } from "./helpers";

type Row = Record<string, unknown>;
type Start = { session_id: string; resumed: boolean; ask_pain_checkin: boolean };
type ActivePlan = {
  plan: Row & { completed_sessions: number };
  suggested_workout_id: string;
  open_session: { id: string } | null;
  workouts: { id: string; label: string; items: (Row & { id: string; care_note: string | null; substitutes: Row[] })[] }[];
};

describe.runIf(dbTestsEnabled)("Fase 3: sessões de treino do aluno", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, trainer: TestUser, trainer2: TestUser, studentUser: TestUser, otherUser: TestUser, ownerB: TestUser;
  let s1: string, s2: string;
  let planId: string, wA: string, wB: string, itemSupra: string, itemPrancha: string, itemSupino: string;
  const ex: Record<string, string> = {};

  const globalEx = async (name: string) =>
    (await fx.db.from("exercises").select("id").is("organization_id", null).eq("name", name).single()).data!.id as string;
  const item = (exercise: string, extra: Row = {}) => ({ exercise_id: exercise, sets: 3, quantity_unit: "reps", quantity_min: 10, quantity_max: 12, ...extra });
  const planPayload = (id?: string) => ({
    id,
    student_id: s1,
    name: "Plano Fase 3",
    starts_on: spDateDaysAgo(5),
    ends_on: spDateDaysAgo(-30),
    workouts: [
      {
        label: "A",
        items: [
          item(ex.supra, { care_note: "Coluna neutra; se a dor passar de 3/10, pare e avise.", substitutes: [ex.deadbug] }),
          item(ex.prancha),
        ],
      },
      { label: "B", items: [item(ex.supino)] },
    ],
  });
  const loadStructure = async () => {
    const { data: ws } = await fx.db.from("plan_workouts").select("id, label").eq("plan_id", planId).order("position");
    wA = ws!.find((w) => w.label === "A")!.id;
    wB = ws!.find((w) => w.label === "B")!.id;
    const { data: its } = await fx.db.from("plan_workout_items").select("id, workout_id, exercise_id").in("workout_id", [wA, wB]);
    itemSupra = its!.find((i) => i.exercise_id === ex.supra)!.id;
    itemPrancha = its!.find((i) => i.exercise_id === ex.prancha)!.id;
    itemSupino = its!.find((i) => i.exercise_id === ex.supino)!.id;
  };
  beforeAll(async () => {
    org = await fx.org("f3");
    orgB = await fx.org("f3-b");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer", "t1");
    trainer2 = await fx.user(org, "trainer", "t2");
    studentUser = await fx.user(org, "student", "aluno");
    otherUser = await fx.user(org, "student", "outro");
    ownerB = await fx.user(orgB, "owner");
    s1 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    s2 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    await fx.db.from("students").update({ trainer_id: trainer.id, user_id: studentUser.id }).eq("id", s1);
    await fx.db.from("students").update({ trainer_id: trainer.id, user_id: otherUser.id }).eq("id", s2);

    ex.supra = await globalEx("Abdominal supra");
    ex.prancha = await globalEx("Prancha frontal");
    ex.deadbug = await globalEx("Dead bug");
    ex.supino = await globalEx("Supino reto com barra");

    planId = await rpc<string>(trainer.client, "save_training_plan", { p_plan: planPayload() });
    expect(await rpc(trainer.client, "activate_plan", { p_plan_id: planId })).toBe("active");
    await loadStructure();
  });
  afterAll(() => fx.cleanup());

  it("perfil do aluno: só o subconjunto seguro do próprio cadastro; staff não recebe nada", async () => {
    const [me] = await rpc<Row[]>(studentUser.client, "get_my_student_profile");
    expect(me).toMatchObject({ student_id: s1, effective_status: "active" });
    expect(me).not.toHaveProperty("notes");
    expect(await rpc<Row[]>(trainer.client, "get_my_student_profile")).toEqual([]);
  });

  it("plano ativo: estrutura, orientação de cuidado e substitutos, sem nada de contraindicação", async () => {
    await fx.db.from("exercise_contraindications").insert({
      organization_id: org.id, exercise_id: ex.supra,
      condition_id: (await fx.db.from("health_conditions").select("id").eq("key", "lombar").single()).data!.id,
      level: "avoid", note: "Nota interna que nunca chega ao aluno",
    });
    const plan = await rpc<ActivePlan>(studentUser.client, "get_my_active_plan");
    expect(plan.plan.id).toBe(planId);
    expect(plan.workouts.map((w) => w.label)).toEqual(["A", "B"]);
    expect(plan.suggested_workout_id).toBe(wA);
    const supra = plan.workouts[0].items.find((i) => i.id === itemSupra)!;
    expect(supra.care_note).toMatch(/Coluna neutra/);
    expect(supra.substitutes).toHaveLength(1);
    const json = JSON.stringify(plan);
    expect(json).not.toMatch(/Nota interna|"level"|condition|contraindication|avoid/);
  });

  it("aluno não treina com o plano de outro aluno; anônimo e staff sem aluno recusados", async () => {
    await expect(rpc(otherUser.client, "start_workout_session", { p_plan_id: planId, p_workout_id: wA })).rejects.toThrow("PLAN_NOT_FOUND");
    await expect(rpc(anon(), "start_workout_session", { p_plan_id: planId, p_workout_id: wA })).rejects.toThrow();
    await expect(rpc(trainer.client, "get_my_active_plan")).rejects.toThrow("STUDENT_NOT_FOUND");
  });

  it("execução: série idempotente, dor obrigatória só com orientação de cuidado, substituto validado, fechamento", async () => {
    const [st] = await rpc<Start[]>(studentUser.client, "start_workout_session", { p_plan_id: planId, p_workout_id: wA });
    expect(st).toMatchObject({ resumed: false, ask_pain_checkin: false });
    const sid = st.session_id;

    // Reenvio da mesma série (fila local) só atualiza.
    await rpc(studentUser.client, "log_set", { p_session_id: sid, p_item_id: itemSupra, p_set_index: 1, p_data: { quantity_value: 10 } });
    await rpc(studentUser.client, "log_set", { p_session_id: sid, p_item_id: itemSupra, p_set_index: 1, p_data: { quantity_value: 12 } });
    await rpc(studentUser.client, "log_set", {
      p_session_id: sid, p_item_id: itemSupra, p_set_index: 2, p_data: { quantity_value: 11, load_value: 5, load_unit: "kg" },
    });
    const { data: logs } = await fx.db.from("session_item_logs").select("id, exercise_name, care_note_required").eq("session_id", sid);
    expect(logs).toHaveLength(1);
    expect(logs![0]).toMatchObject({ exercise_name: "Abdominal supra", care_note_required: true });
    const { data: sets } = await fx.db.from("session_set_logs").select("set_index, quantity_value").eq("item_log_id", logs![0].id).order("set_index");
    expect(sets).toEqual([{ set_index: 1, quantity_value: 12 }, { set_index: 2, quantity_value: 11 }]);

    await expect(
      rpc(studentUser.client, "complete_session_item", { p_session_id: sid, p_item_id: itemSupra, p_pain_score: null }),
    ).rejects.toThrow("PAIN_REQUIRED");
    await expect(
      rpc(studentUser.client, "complete_session_item", { p_session_id: sid, p_item_id: itemSupra, p_pain_score: 11 }),
    ).rejects.toThrow("INVALID_INPUT");
    await expect(
      rpc(studentUser.client, "complete_session_item", { p_session_id: sid, p_item_id: itemSupra, p_pain_score: 2, p_substitute_exercise_id: ex.supino }),
    ).rejects.toThrow("INVALID_SUBSTITUTE");
    await rpc(studentUser.client, "complete_session_item", { p_session_id: sid, p_item_id: itemSupra, p_pain_score: 7 });
    // Sem orientação de cuidado, a dor é opcional.
    await rpc(studentUser.client, "complete_session_item", { p_session_id: sid, p_item_id: itemPrancha, p_pain_score: null });
    // Item de outra divisão não entra nesta sessão.
    await expect(
      rpc(studentUser.client, "log_set", { p_session_id: sid, p_item_id: itemSupino, p_set_index: 1, p_data: {} }),
    ).rejects.toThrow("ITEM_NOT_FOUND");
    // O outro aluno não escreve na sessão deste.
    await expect(
      rpc(otherUser.client, "log_set", { p_session_id: sid, p_item_id: itemSupra, p_set_index: 3, p_data: {} }),
    ).rejects.toThrow("SESSION_NOT_FOUND");

    await rpc(studentUser.client, "finish_workout_session", { p_session_id: sid, p_rpe: 8, p_feedback: "Cansativo" });
    await rpc(studentUser.client, "finish_workout_session", { p_session_id: sid, p_rpe: 8, p_feedback: "Cansativo" }); // reenvio: nada
    await expect(
      rpc(studentUser.client, "log_set", { p_session_id: sid, p_item_id: itemSupra, p_set_index: 3, p_data: {} }),
    ).rejects.toThrow("SESSION_CLOSED");

    const plan = await rpc<ActivePlan>(studentUser.client, "get_my_active_plan");
    expect(plan.suggested_workout_id).toBe(wB); // rodízio: depois de A, B
    expect(plan.plan.completed_sessions).toBe(1);
  });

  it("pergunta de dor no início da próxima sessão; retomar a mesma divisão não duplica", async () => {
    const [st] = await rpc<Start[]>(studentUser.client, "start_workout_session", { p_plan_id: planId, p_workout_id: wB });
    expect(st.ask_pain_checkin).toBe(true); // a sessão anterior teve dor 7
    await rpc(studentUser.client, "record_pain_checkin", { p_session_id: st.session_id, p_answer: "ainda_incomoda" });
    await expect(rpc(studentUser.client, "record_pain_checkin", { p_session_id: st.session_id, p_answer: "talvez" })).rejects.toThrow("INVALID_INPUT");

    const [again] = await rpc<Start[]>(studentUser.client, "start_workout_session", { p_plan_id: planId, p_workout_id: wB });
    expect(again).toMatchObject({ session_id: st.session_id, resumed: true, ask_pain_checkin: false });
    await rpc(studentUser.client, "finish_workout_session", { p_session_id: st.session_id });

    // Depois de responder, uma sessão sem dor nova não pergunta de novo.
    const [next] = await rpc<Start[]>(studentUser.client, "start_workout_session", { p_plan_id: planId, p_workout_id: wA });
    expect(next.ask_pain_checkin).toBe(false);
    await rpc(studentUser.client, "finish_workout_session", { p_session_id: next.session_id });
  });

  it("RLS: titular e responsável leem; outro aluno, professor sem acesso e outra organização não", async () => {
    expect(((await studentUser.client.from("workout_sessions").select("id")).data ?? []).length).toBeGreaterThanOrEqual(3);
    expect((await otherUser.client.from("workout_sessions").select("id")).data).toEqual([]);
    expect((await trainer2.client.from("workout_sessions").select("id")).data).toEqual([]);
    expect((await ownerB.client.from("workout_sessions").select("id")).data).toEqual([]);
    expect(((await trainer.client.from("session_item_logs").select("id")).data ?? []).length).toBeGreaterThan(0);
    expect((await otherUser.client.from("session_set_logs").select("id")).data).toEqual([]);
    // Escrita direta recusada.
    expect((await studentUser.client.from("workout_sessions").insert({
      organization_id: org.id, student_id: s1, workout_label: "A",
    })).error).not.toBeNull();
  });

  it("avisos de dor: completo para o responsável, restrito para o professor do plano, oculto para o owner sem consentimento", async () => {
    const full = await rpc<Row[]>(trainer.client, "student_session_alerts", { p_student_id: s1 });
    expect(full).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "pain_high", exercise_name: "Abdominal supra", pain_score: 7, restricted: false, hidden: false }),
      expect.objectContaining({ kind: "pain_persisting", pain_checkin: "ainda_incomoda", restricted: false }),
    ]));

    // trainer2 vira professor do plano (sem acesso ao cadastro/saúde do aluno).
    await rpc(trainer.client, "save_training_plan", { p_plan: { ...planPayload(planId), trainer_id: trainer2.id } });
    await loadStructure();
    const restricted = await rpc<Row[]>(trainer2.client, "student_session_alerts", { p_student_id: s1 });
    expect(restricted.length).toBeGreaterThan(0);
    for (const r of restricted) {
      expect(r).toMatchObject({ restricted: true, kind: null, pain_score: null, pain_checkin: null, feedback_note: null });
    }

    // Owner não é o responsável e o titular não confirmou nada: oculto (sem revelar se há aviso).
    expect(await rpc<Row[]>(owner.client, "student_session_alerts", { p_student_id: s1 })).toEqual([
      expect.objectContaining({ hidden: true, session_id: null, pain_score: null }),
    ]);
    await expect(rpc(studentUser.client, "student_session_alerts", { p_student_id: s1 })).rejects.toThrow("FORBIDDEN");
    await expect(rpc(ownerB.client, "student_session_alerts", { p_student_id: s1 })).rejects.toThrow("STUDENT_NOT_FOUND");

    // "Visto": só quem vê o aviso completo.
    const sid = full[0].session_id as string;
    await expect(rpc(trainer2.client, "acknowledge_session_alert", { p_session_id: sid })).rejects.toThrow("SESSION_NOT_FOUND");
    await expect(rpc(owner.client, "acknowledge_session_alert", { p_session_id: sid })).rejects.toThrow("FORBIDDEN");
    for (const id of new Set(full.map((r) => r.session_id as string))) {
      await rpc(trainer.client, "acknowledge_session_alert", { p_session_id: id });
    }
    expect(await rpc<Row[]>(trainer.client, "student_session_alerts", { p_student_id: s1 })).toEqual([]);
  });

  it("plano editado durante a sessão: histórico preservado; item antigo recusado com ITEM_NOT_FOUND", async () => {
    const [st] = await rpc<Start[]>(studentUser.client, "start_workout_session", { p_plan_id: planId, p_workout_id: wA });
    const oldItem = itemSupra;
    await rpc(studentUser.client, "log_set", { p_session_id: st.session_id, p_item_id: oldItem, p_set_index: 1, p_data: { quantity_value: 9 } });
    await rpc(trainer.client, "save_training_plan", { p_plan: planPayload(planId) }); // ids novos
    await loadStructure();
    const { data: kept } = await fx.db.from("session_item_logs").select("item_id, exercise_name").eq("session_id", st.session_id);
    expect(kept).toEqual([{ item_id: null, exercise_name: "Abdominal supra" }]);
    await expect(
      rpc(studentUser.client, "log_set", { p_session_id: st.session_id, p_item_id: oldItem, p_set_index: 2, p_data: {} }),
    ).rejects.toThrow("ITEM_NOT_FOUND");
    const [row] = (await fx.db.from("workout_sessions").select("workout_id, workout_label").eq("id", st.session_id)).data!;
    expect(row).toEqual({ workout_id: null, workout_label: "A" });
  });

  it("sessão aberta há mais de 6 h: aparece como abandonada e não impede uma nova", async () => {
    const [st] = await rpc<Start[]>(studentUser.client, "start_workout_session", { p_plan_id: planId, p_workout_id: wB });
    await fx.db.from("workout_sessions").update({ started_at: new Date(Date.now() - 7 * 3600_000).toISOString() }).eq("id", st.session_id);
    const history = await rpc<Row[]>(studentUser.client, "get_my_workout_history");
    expect(history.find((h) => h.session_id === st.session_id)).toMatchObject({ status: "abandoned" });

    const [fresh] = await rpc<Start[]>(studentUser.client, "start_workout_session", { p_plan_id: planId, p_workout_id: wB });
    expect(fresh.session_id).not.toBe(st.session_id);
    expect(fresh.resumed).toBe(false);
    const [old] = (await fx.db.from("workout_sessions").select("status").eq("id", st.session_id)).data!;
    expect(old.status).toBe("abandoned"); // gravado ao iniciar a nova
    await rpc(studentUser.client, "finish_workout_session", { p_session_id: fresh.session_id });
  });

  it("acesso suspenso (expirado/inativo): não treina, mas vê o histórico", async () => {
    await fx.db.from("students").update({ access_expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", s1);
    try {
      const [me] = await rpc<Row[]>(studentUser.client, "get_my_student_profile");
      expect(me.effective_status).toBe("expired");
      await expect(rpc(studentUser.client, "get_my_active_plan")).rejects.toThrow("ACCESS_SUSPENDED");
      await expect(rpc(studentUser.client, "start_workout_session", { p_plan_id: planId, p_workout_id: wA })).rejects.toThrow("ACCESS_SUSPENDED");
      expect((await rpc<Row[]>(studentUser.client, "get_my_workout_history")).length).toBeGreaterThan(0);
    } finally {
      await fx.db.from("students").update({ access_expires_at: null }).eq("id", s1);
    }
    await fx.db.from("students").update({ status: "inactive" }).eq("id", s1);
    try {
      await expect(rpc(studentUser.client, "get_my_active_plan")).rejects.toThrow("ACCESS_SUSPENDED");
    } finally {
      await fx.db.from("students").update({ status: "active" }).eq("id", s1);
    }
  });

  it("modo presencial: responsável registra em nome do aluno; sem acesso ou sem ver a saúde é recusado", async () => {
    const [st] = await rpc<Start[]>(trainer.client, "start_workout_session", { p_plan_id: planId, p_workout_id: wA, p_student_id: s1 });
    await rpc(trainer.client, "log_set", { p_session_id: st.session_id, p_item_id: itemPrancha, p_set_index: 1, p_data: { quantity_value: 30 } });
    await rpc(trainer.client, "finish_workout_session", { p_session_id: st.session_id, p_rpe: 6 });
    const [row] = (await fx.db.from("workout_sessions").select("recorded_by, status").eq("id", st.session_id)).data!;
    expect(row).toEqual({ recorded_by: trainer.id, status: "completed" });
    const history = await rpc<Row[]>(studentUser.client, "get_my_workout_history");
    expect(history.find((h) => h.session_id === st.session_id)).toMatchObject({ by_trainer: true });

    await expect(
      rpc(trainer2.client, "start_workout_session", { p_plan_id: planId, p_workout_id: wA, p_student_id: s1 }),
    ).rejects.toThrow("STUDENT_NOT_FOUND");
    // Owner com acesso ao aluno, mas sem ver a saúde (não é o responsável e o titular não confirmou).
    await expect(
      rpc(owner.client, "start_workout_session", { p_plan_id: planId, p_workout_id: wA, p_student_id: s1 }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      rpc(ownerB.client, "start_workout_session", { p_plan_id: planId, p_workout_id: wA, p_student_id: s1 }),
    ).rejects.toThrow("STUDENT_NOT_FOUND");
  });

  it("orientação de cuidado sobrevive às cópias do plano", async () => {
    const copy = await rpc<string>(trainer.client, "duplicate_plan", { p_plan_id: planId });
    const { data: ws } = await fx.db.from("plan_workouts").select("id").eq("plan_id", copy);
    const { data: items } = await fx.db.from("plan_workout_items").select("care_note").in("workout_id", ws!.map((w) => w.id));
    expect(items!.filter((i) => i.care_note)).toHaveLength(1);
  });

  it("s2 (outro aluno) não tem plano ativo: get_my_active_plan devolve nulo", async () => {
    expect(await rpc(otherUser.client, "get_my_active_plan")).toBeNull();
  });
});
