import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, spDateDaysAgo, studentData, type TestOrg, type TestUser } from "./helpers";

type Row = Record<string, unknown>;
type Start = { session_id: string; resumed: boolean; ask_pain_checkin: boolean };
type ActivePlan = {
  plan: Row & { completed_sessions: number };
  suggested_workout_id: string;
  open_session: { id: string } | null;
  workouts: { id: string; label: string; items: (Row & { id: string; care_note: string | null; ask_pain: boolean; substitutes: Row[] })[] }[];
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
  type PayloadItem = Row & { id?: string };
  type Payload = Row & { workouts: { id?: string; label: string; items: PayloadItem[] }[] };
  /** Payload como o montador envia: com os ids atuais de divisões e itens. */
  const currentPayload = async (): Promise<Payload> => {
    const { data: p } = await fx.db.from("training_plans").select("id, student_id, name, starts_on, ends_on, trainer_id").eq("id", planId).single();
    const { data: ws } = await fx.db.from("plan_workouts").select("id, label").eq("plan_id", planId).order("position");
    const workouts: Payload["workouts"] = [];
    for (const w of ws!) {
      const { data: its } = await fx.db
        .from("plan_workout_items")
        .select("id, exercise_id, sets, quantity_unit, quantity_min, quantity_max, care_note, plan_item_substitutes(exercise_id, position)")
        .eq("workout_id", w.id)
        .order("position");
      workouts.push({
        id: w.id,
        label: w.label,
        items: its!.map((i) => ({
          id: i.id, exercise_id: i.exercise_id, sets: i.sets, quantity_unit: i.quantity_unit,
          quantity_min: i.quantity_min, quantity_max: i.quantity_max, care_note: i.care_note,
          substitutes: [...i.plan_item_substitutes].sort((x, y) => x.position - y.position).map((x) => x.exercise_id),
        })),
      });
    }
    return { ...p!, workouts };
  };
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
    const { data: logs } = await fx.db.from("session_item_logs").select("id, exercise_name, pain_required").eq("session_id", sid);
    expect(logs).toHaveLength(1);
    expect(logs![0]).toMatchObject({ exercise_name: "Abdominal supra", pain_required: true });
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

  it("salvar o plano preserva os ids de divisões e itens que continuam; só o novo ganha id; o removido sai", async () => {
    const before = await currentPayload();
    const newWorkoutId = crypto.randomUUID();
    // Reordena A (prancha antes do supra), move o supino de B para A, cria a divisão C (id do cliente) e esvazia B.
    const [a, b] = before.workouts;
    const payload = {
      ...before,
      workouts: [
        { ...a, items: [a.items[1], a.items[0], b.items[0]] },
        { ...b, items: [] },
        { id: newWorkoutId, label: "C", items: [item(ex.prancha)] },
      ],
    };
    await rpc(trainer.client, "save_training_plan", { p_plan: payload });
    const { data: ws } = await fx.db.from("plan_workouts").select("id, label, position").eq("plan_id", planId).order("position");
    expect(ws).toEqual([
      { id: wA, label: "A", position: 0 },
      { id: wB, label: "B", position: 1 },
      { id: newWorkoutId, label: "C", position: 2 },
    ]);
    const { data: its } = await fx.db.from("plan_workout_items").select("id, workout_id, position").eq("workout_id", wA).order("position");
    expect(its).toEqual([
      { id: itemPrancha, workout_id: wA, position: 0 },
      { id: itemSupra, workout_id: wA, position: 1 },
      { id: itemSupino, workout_id: wA, position: 2 },
    ]);
    // Orientação de cuidado e substitutos continuam no item preservado.
    const { data: supra } = await fx.db.from("plan_workout_items").select("care_note").eq("id", itemSupra).single();
    expect(supra!.care_note).toMatch(/Coluna neutra/);
    expect((await fx.db.from("plan_item_substitutes").select("exercise_id").eq("item_id", itemSupra)).data).toEqual([{ exercise_id: ex.deadbug }]);

    // Salvar de novo o mesmo conteúdo não muda nenhum id.
    await rpc(trainer.client, "save_training_plan", { p_plan: await currentPayload() });
    const { data: again } = await fx.db.from("plan_workout_items").select("id").eq("workout_id", wA).order("position");
    expect(again!.map((r) => r.id)).toEqual([itemPrancha, itemSupra, itemSupino]);

    // Volta à estrutura original (C sai: a divisão e o item dela são apagados).
    await rpc(trainer.client, "save_training_plan", { p_plan: { ...before, trainer_id: trainer2.id } });
    expect((await fx.db.from("plan_workouts").select("id").eq("id", newWorkoutId)).data).toEqual([]);
    await loadStructure();
    expect([itemSupra, itemPrancha, itemSupino]).toEqual([before.workouts[0].items[0].id, before.workouts[0].items[1].id, before.workouts[1].items[0].id]);
  });

  it("plano editado durante a sessão: a sessão aberta segue a cópia da divisão; a mudança vale na próxima", async () => {
    const [st] = await rpc<Start[]>(studentUser.client, "start_workout_session", { p_plan_id: planId, p_workout_id: wA });
    await rpc(studentUser.client, "log_set", { p_session_id: st.session_id, p_item_id: itemSupra, p_set_index: 1, p_data: { quantity_value: 9 } });

    // O professor tira a prancha e o supra do plano (e salva sem ids — formato antigo, tudo novo).
    await rpc(trainer.client, "save_training_plan", {
      p_plan: { ...planPayload(planId), workouts: [{ label: "A", items: [item(ex.supino)] }, { label: "B", items: [item(ex.supino)] }] },
    });

    // A sessão aberta continua aceitando os itens da cópia, inclusive os que saíram do plano.
    await rpc(studentUser.client, "log_set", { p_session_id: st.session_id, p_item_id: itemPrancha, p_set_index: 1, p_data: { quantity_value: 30 } });
    await rpc(studentUser.client, "complete_session_item", { p_session_id: st.session_id, p_item_id: itemSupra, p_pain_score: 1 });
    const session = await rpc<{ workout: { items: { id: string }[] }; items: Row[] }>(studentUser.client, "get_training_session", {
      p_session_id: st.session_id,
    });
    expect(session.workout.items.map((i) => i.id)).toEqual([itemSupra, itemPrancha]);
    expect(session.items).toHaveLength(2);
    // Item que nunca esteve na cópia continua recusado.
    await expect(
      rpc(studentUser.client, "log_set", { p_session_id: st.session_id, p_item_id: itemSupino, p_set_index: 1, p_data: {} }),
    ).rejects.toThrow("ITEM_NOT_FOUND");
    await rpc(studentUser.client, "finish_workout_session", { p_session_id: st.session_id });

    // A próxima sessão já usa o plano novo.
    const plan = await rpc<ActivePlan>(studentUser.client, "get_my_active_plan");
    expect(plan.workouts[0].items.map((i) => (i.exercise as Row).id)).toEqual([ex.supino]);

    // Restaura o plano do teste (supra com orientação, prancha, supino) para os próximos cenários.
    await rpc(trainer.client, "save_training_plan", { p_plan: planPayload(planId) });
    await loadStructure();
  });

  it("série guarda o exercício realmente feito (substituto), para a evolução de cargas", async () => {
    const [st] = await rpc<Start[]>(studentUser.client, "start_workout_session", { p_plan_id: planId, p_workout_id: wA });
    await rpc(studentUser.client, "log_set", { p_session_id: st.session_id, p_item_id: itemSupra, p_set_index: 1, p_data: { quantity_value: 10 } });
    await rpc(studentUser.client, "log_set", {
      p_session_id: st.session_id, p_item_id: itemSupra, p_set_index: 2, p_data: { quantity_value: 8, substitute_exercise_id: ex.deadbug },
    });
    const { data: log } = await fx.db.from("session_item_logs").select("id, exercise_id, substitute").eq("session_id", st.session_id).single();
    expect(log).toMatchObject({ exercise_id: ex.deadbug, substitute: true });
    const { data: sets } = await fx.db.from("session_set_logs").select("set_index, exercise_id").eq("item_log_id", log!.id).order("set_index");
    expect(sets).toEqual([{ set_index: 1, exercise_id: ex.supra }, { set_index: 2, exercise_id: ex.deadbug }]);
    await rpc(studentUser.client, "complete_session_item", {
      p_session_id: st.session_id, p_item_id: itemSupra, p_pain_score: 0, p_substitute_exercise_id: ex.deadbug,
    });
    await rpc(studentUser.client, "finish_workout_session", { p_session_id: st.session_id });
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

  it("modo presencial completo: o responsável registra em nome do aluno, com dor", async () => {
    const plan = await rpc<ActivePlan & { mode: string }>(trainer.client, "get_my_active_plan", { p_student_id: s1 });
    expect(plan.mode).toBe("full");
    const [st] = await rpc<Start[]>(trainer.client, "start_workout_session", { p_plan_id: planId, p_workout_id: wA, p_student_id: s1 });
    await rpc(trainer.client, "log_set", { p_session_id: st.session_id, p_item_id: itemPrancha, p_set_index: 1, p_data: { quantity_value: 30 } });
    await rpc(trainer.client, "complete_session_item", { p_session_id: st.session_id, p_item_id: itemSupra, p_pain_score: 3 });
    await rpc(trainer.client, "finish_workout_session", { p_session_id: st.session_id, p_rpe: 6 });
    const [row] = (await fx.db.from("workout_sessions").select("recorded_by, status").eq("id", st.session_id)).data!;
    expect(row).toEqual({ recorded_by: trainer.id, status: "completed" });
    const history = await rpc<Row[]>(studentUser.client, "get_my_workout_history");
    expect(history.find((h) => h.session_id === st.session_id)).toMatchObject({ by_trainer: true });
    await expect(
      rpc(ownerB.client, "start_workout_session", { p_plan_id: planId, p_workout_id: wA, p_student_id: s1 }),
    ).rejects.toThrow("STUDENT_NOT_FOUND");
  });

  it("modo presencial restrito: professor do plano (e staff sem ver a saúde) registra SEM dor e não lê dor", async () => {
    // trainer2 é o professor do plano ativo, sem acesso ao cadastro nem à saúde do aluno.
    const plan = await rpc<ActivePlan & { mode: string }>(trainer2.client, "get_my_active_plan", { p_student_id: s1 });
    expect(plan.mode).toBe("restricted");
    const [st] = await rpc<Start[]>(trainer2.client, "start_workout_session", { p_plan_id: planId, p_workout_id: wA, p_student_id: s1 });
    expect(st.ask_pain_checkin).toBe(false);
    await rpc(trainer2.client, "log_set", { p_session_id: st.session_id, p_item_id: itemSupra, p_set_index: 1, p_data: { quantity_value: 10 } });
    await expect(
      rpc(trainer2.client, "complete_session_item", { p_session_id: st.session_id, p_item_id: itemSupra, p_pain_score: 2 }),
    ).rejects.toThrow("FORBIDDEN");
    // Sem dor, mesmo com orientação de cuidado.
    await rpc(trainer2.client, "complete_session_item", { p_session_id: st.session_id, p_item_id: itemSupra, p_pain_score: null });
    await expect(rpc(trainer2.client, "record_pain_checkin", { p_session_id: st.session_id, p_answer: "normal" })).rejects.toThrow("FORBIDDEN");
    await rpc(trainer2.client, "finish_workout_session", { p_session_id: st.session_id, p_rpe: 7 });

    // Leitura de uma sessão com dor (a do responsável, acima): dor escondida no modo restrito, visível no completo.
    const { data: withPain } = await fx.db.from("workout_sessions").select("id").eq("student_id", s1).eq("recorded_by", trainer.id).single();
    const r = await rpc<{ mode: string; items: Row[] }>(trainer2.client, "get_training_session", { p_session_id: withPain!.id });
    expect(r.mode).toBe("restricted");
    expect(r.items.every((i) => i.pain_score === null)).toBe(true);
    const f = await rpc<{ items: Row[] }>(trainer.client, "get_training_session", { p_session_id: withPain!.id });
    expect(f.items.some((i) => i.pain_score === 3)).toBe(true);
    // Nem RLS nem histórico para quem é restrito.
    expect((await trainer2.client.from("workout_sessions").select("id")).data).toEqual([]);
    await expect(rpc(trainer2.client, "get_my_workout_history", { p_student_id: s1 })).rejects.toThrow("STUDENT_NOT_FOUND");

    // Owner com acesso ao aluno, mas sem ver a saúde: também restrito.
    const [os] = await rpc<Start[]>(owner.client, "start_workout_session", { p_plan_id: planId, p_workout_id: wB, p_student_id: s1 });
    await rpc(owner.client, "log_set", { p_session_id: os.session_id, p_item_id: itemSupino, p_set_index: 1, p_data: { quantity_value: 8, load_value: 40, load_unit: "kg" } });
    await rpc(owner.client, "finish_workout_session", { p_session_id: os.session_id });
    // Outro aluno de outro professor: nem o trainer2 treina.
    await expect(
      rpc(trainer2.client, "start_workout_session", { p_plan_id: planId, p_workout_id: wA, p_student_id: s2 }),
    ).rejects.toThrow(/STUDENT_NOT_FOUND|PLAN_NOT_FOUND/);
  });

  it("orientação de cuidado sobrevive a duplicar, salvar como modelo, aplicar modelo e copiar para alunos", async () => {
    const careNotes = async (id: string) => {
      const { data: ws } = await fx.db.from("plan_workouts").select("id").eq("plan_id", id);
      const { data: items } = await fx.db.from("plan_workout_items").select("care_note").in("workout_id", ws!.map((w) => w.id));
      return items!.map((i) => i.care_note).filter(Boolean);
    };
    const expected = [expect.stringMatching(/Coluna neutra/)];

    const dup = await rpc<string>(trainer.client, "duplicate_plan", { p_plan_id: planId });
    expect(await careNotes(dup)).toEqual(expected);

    const template = await rpc<string>(trainer.client, "save_plan_as_template", { p_plan_id: planId, p_name: "Modelo F3" });
    expect(await careNotes(template)).toEqual(expected);

    const applied = await rpc<string>(trainer.client, "apply_template_to_student", { p_template_id: template, p_student_id: s2 });
    expect(await careNotes(applied)).toEqual(expected);

    const [bulk] = await rpc<{ plan_id: string; error: string | null }[]>(trainer.client, "apply_plan_to_students", {
      p_source: planId, p_students: [s2], p_starts_on: spDateDaysAgo(0), p_ends_on: spDateDaysAgo(-30), p_no_end: false, p_activate: false,
    });
    expect(bulk.error).toBeNull();
    expect(await careNotes(bulk.plan_id)).toEqual(expected);
  });

  it("regra da dor: pedir dor só com alerta para o aluno ou orientação de cuidado — só o booleano, nada de saúde", async () => {
    // s1 entra num grupo ligado a "Coluna lombar", com regra da equipe na prancha (sem orientação de cuidado).
    const lombar = (await fx.db.from("health_conditions").select("id").eq("key", "lombar").single()).data!.id;
    const { data: g } = await fx.db.from("special_groups").insert({ organization_id: org.id, name: "Grupo Sigiloso F3" }).select("id").single();
    await fx.db.from("special_group_conditions").insert({ organization_id: org.id, group_id: g!.id, condition_id: lombar });
    await fx.db.from("student_groups").insert({ organization_id: org.id, student_id: s1, group_id: g!.id });
    await fx.db.from("exercise_contraindications").insert({
      organization_id: org.id, exercise_id: ex.prancha, condition_id: lombar, level: "caution", note: "Nota sigilosa da prancha",
    });

    const plan = await rpc<ActivePlan>(studentUser.client, "get_my_active_plan");
    const ask = Object.fromEntries(plan.workouts.flatMap((w) => w.items).map((i) => [(i.exercise as Row).id as string, i.ask_pain]));
    expect(ask).toEqual({ [ex.supra]: true, [ex.prancha]: true, [ex.supino]: false }); // orientação · alerta · nada
    const json = JSON.stringify(plan);
    expect(json).not.toMatch(/Nota sigilosa|Nota interna|Grupo Sigiloso|Coluna lombar|"level"|caution|avoid|condition/);

    // Na execução: prancha (só alerta) exige dor; supino (nada) não.
    const [st] = await rpc<Start[]>(studentUser.client, "start_workout_session", { p_plan_id: planId, p_workout_id: wA });
    await expect(
      rpc(studentUser.client, "complete_session_item", { p_session_id: st.session_id, p_item_id: itemPrancha, p_pain_score: null }),
    ).rejects.toThrow("PAIN_REQUIRED");
    await rpc(studentUser.client, "complete_session_item", { p_session_id: st.session_id, p_item_id: itemPrancha, p_pain_score: 0 });
    const session = await rpc<{ workout: { items: Row[] } }>(studentUser.client, "get_training_session", { p_session_id: st.session_id });
    expect(JSON.stringify(session)).not.toMatch(/Nota sigilosa|Grupo Sigiloso|Coluna lombar|"level"|caution|avoid|condition/);
    await rpc(studentUser.client, "finish_workout_session", { p_session_id: st.session_id });

    const [sb] = await rpc<Start[]>(studentUser.client, "start_workout_session", { p_plan_id: planId, p_workout_id: wB });
    await rpc(studentUser.client, "complete_session_item", { p_session_id: sb.session_id, p_item_id: itemSupino, p_pain_score: null });

    // Modo restrito (professor do plano sem acesso à saúde): o booleano nunca vaza, nem na cópia da sessão do aluno.
    const restricted = await rpc<ActivePlan>(trainer2.client, "get_my_active_plan", { p_student_id: s1 });
    expect(restricted.workouts.flatMap((w) => w.items).every((i) => i.ask_pain === false)).toBe(true);
    const rs = await rpc<{ workout: { items: Row[] } }>(trainer2.client, "get_training_session", { p_session_id: st.session_id });
    expect(rs.workout.items.every((i) => i.ask_pain === false)).toBe(true);
    await rpc(studentUser.client, "finish_workout_session", { p_session_id: sb.session_id });
  });

  it("s2 (outro aluno) não tem plano ativo: get_my_active_plan devolve nulo", async () => {
    expect(await rpc(otherUser.client, "get_my_active_plan")).toBeNull();
  });
});
