import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, studentData, type TestOrg, type TestUser } from "./helpers";

/**
 * PARTE A (migration 20261124130000): edição rápida da prescrição. Um só ponto de escrita (apply_prescription_changes)
 * com o valor antigo esperado; histórico com desfazer; sugestões a partir das séries registradas; passo por conta.
 */
interface Batch { batch_id: string; source: string; undone_at: string | null; item_gone: boolean; changes: { field: string; old: number | null; new: number | null }[] }

describe.runIf(dbTestsEnabled)("edição rápida da prescrição", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, trainer: TestUser, trainer2: TestUser, studentUser: TestUser, ownerB: TestUser;
  let studentId: string, planId: string, workoutId: string, itemLoad: string, itemRange: string, itemDetailed: string, itemText: string;
  let templateItem: string, exerciseId: string;

  const item = async (id: string) => (await fx.db.from("plan_workout_items").select("*").eq("id", id).single()).data!;
  const apply = (u: TestUser, changes: unknown[], source = "quick", session?: string) =>
    rpc<{ batch_id: string; applied: number }>(u.client, "apply_prescription_changes", { p_changes: changes, p_source: source, ...(session ? { p_session_id: session } : {}) });
  const addItem = async (wId: string, pos: number, extra: Record<string, unknown>) => {
    const { data, error } = await fx.db.from("plan_workout_items").insert({
      organization_id: org.id, workout_id: wId, exercise_id: exerciseId, position: pos, sets: 3, quantity_unit: "reps",
      quantity_min: 10, quantity_max: null, ...extra,
    }).select("id").single();
    if (error) throw error;
    return data.id as string;
  };

  beforeAll(async () => {
    org = await fx.org("quick");
    orgB = await fx.org("quick-b");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer");
    trainer2 = await fx.user(org, "trainer", "t2");
    studentUser = await fx.user(org, "student", "aluno");
    ownerB = await fx.user(orgB, "owner", "ob");
    exerciseId = (await fx.db.from("exercises").select("id").is("organization_id", null).limit(1).single()).data!.id;

    studentId = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    await fx.db.from("students").update({ trainer_id: trainer.id, user_id: studentUser.id }).eq("id", studentId);
    const { data: p } = await fx.db.from("training_plans").insert({
      organization_id: org.id, student_id: studentId, trainer_id: trainer.id, name: "Plano rápido", status: "active",
      starts_on: "2026-11-01", ends_on: "2026-12-31",
    }).select("id").single();
    planId = p!.id;
    workoutId = (await fx.db.from("plan_workouts").insert({ organization_id: org.id, plan_id: planId, label: "A", name: "Peito", position: 0 }).select("id").single()).data!.id;
    itemLoad = await addItem(workoutId, 0, { load_value: 40, load_unit: "kg" });
    itemRange = await addItem(workoutId, 1, { quantity_min: 8, quantity_max: 10, load_value: 20, load_unit: "kg" });
    itemDetailed = await addItem(workoutId, 2, { load_value: 30, load_unit: "kg" });
    await fx.db.from("plan_item_sets").insert({ organization_id: org.id, item_id: itemDetailed, position: 0, set_type: "work", quantity_unit: "reps", quantity_min: 10 });
    itemText = await addItem(workoutId, 3, { load_text: "moderada" });

    // Modelo (sem aluno): fora da edição rápida.
    const { data: tpl } = await fx.db.from("training_plans").insert({ organization_id: org.id, name: "Modelo", status: "draft", created_by: owner.id }).select("id").single();
    const tw = (await fx.db.from("plan_workouts").insert({ organization_id: org.id, plan_id: tpl!.id, label: "A", position: 0 }).select("id").single()).data!.id;
    templateItem = await addItem(tw, 0, { load_value: 10, load_unit: "kg" });
  });
  afterAll(() => fx.cleanup());

  it("+/− carga, repetições e séries: grava com o valor antigo esperado e registra quem/quando/antes→depois", async () => {
    const r = await apply(trainer, [
      { item_id: itemLoad, field: "load_value", old: 40, new: 42.5 },
      { item_id: itemLoad, field: "sets", old: 3, new: 4 },
      { item_id: itemRange, field: "quantity_min", old: 8, new: 9 },
      { item_id: itemRange, field: "quantity_max", old: 10, new: 11 },
    ]);
    expect(r.applied).toBe(4);
    expect(await item(itemLoad)).toMatchObject({ load_value: 42.5, sets: 4 });
    expect(await item(itemRange)).toMatchObject({ quantity_min: 9, quantity_max: 11 });
    const h = await rpc<Batch[]>(trainer.client, "list_prescription_changes", { p_student_id: studentId });
    expect(h[0]).toMatchObject({ batch_id: r.batch_id, source: "quick", undone_at: null });
    expect(h[0]!.changes).toHaveLength(4);
    expect(h[0]!.changes).toContainEqual(expect.objectContaining({ field: "load_value", old: 40, new: 42.5 }));
    const { data: audit } = await fx.db.from("audit_logs").select("action").eq("organization_id", org.id).eq("action", "prescription.changed");
    expect(audit!.length).toBeGreaterThan(0);
  });

  it("valor antigo diferente (tela desatualizada) → PRESCRIPTION_CHANGED e nada muda (tudo ou nada)", async () => {
    await expect(apply(owner, [
      { item_id: itemLoad, field: "sets", old: 4, new: 5 },
      { item_id: itemLoad, field: "load_value", old: 40, new: 45 },
    ])).rejects.toThrow("PRESCRIPTION_CHANGED");
    expect(await item(itemLoad)).toMatchObject({ load_value: 42.5, sets: 4 });
  });

  it("recusa: séries detalhadas, carga em texto, faixa invertida, limites, campo inválido, repetido, modelo sem aluno", async () => {
    await expect(apply(owner, [{ item_id: itemDetailed, field: "load_value", old: 30, new: 32.5 }])).rejects.toThrow("INVALID_INPUT");
    await expect(apply(owner, [{ item_id: itemText, field: "load_value", old: null, new: 10 }])).rejects.toThrow("INVALID_INPUT");
    await expect(apply(owner, [{ item_id: itemRange, field: "quantity_max", old: 11, new: 5 }])).rejects.toThrow("INVALID_INPUT");
    await expect(apply(owner, [{ item_id: itemLoad, field: "sets", old: 4, new: 21 }])).rejects.toThrow("INVALID_INPUT");
    await expect(apply(owner, [{ item_id: itemLoad, field: "load_value", old: 42.5, new: -1 }])).rejects.toThrow("INVALID_INPUT");
    await expect(apply(owner, [{ item_id: itemLoad, field: "rest_min", old: null, new: 60 }])).rejects.toThrow("INVALID_INPUT");
    await expect(apply(owner, [
      { item_id: itemLoad, field: "sets", old: 4, new: 5 }, { item_id: itemLoad, field: "sets", old: 5, new: 6 },
    ])).rejects.toThrow("INVALID_INPUT");
    await expect(apply(owner, [{ item_id: templateItem, field: "load_value", old: 10, new: 12.5 }])).rejects.toThrow("INVALID_INPUT");
    await expect(apply(owner, [{ item_id: itemLoad, field: "sets", old: 4, new: 5 }], "undo")).rejects.toThrow("INVALID_INPUT");
  });

  it("faixa: mudança grande válida passa em qualquer ordem (e o desfazer também); invertida → INVALID_INPUT", async () => {
    // 9–11 → 13–15 enviando o mínimo antes do máximo (no meio ficaria 13–11): o banco aplica na ordem segura.
    const b = await apply(owner, [
      { item_id: itemRange, field: "quantity_min", old: 9, new: 13 },
      { item_id: itemRange, field: "quantity_max", old: 11, new: 15 },
    ]);
    expect(await item(itemRange)).toMatchObject({ quantity_min: 13, quantity_max: 15 });
    await rpc(owner.client, "undo_prescription_batch", { p_batch_id: b.batch_id });
    expect(await item(itemRange)).toMatchObject({ quantity_min: 9, quantity_max: 11 });
    await expect(apply(owner, [{ item_id: itemRange, field: "quantity_min", old: 9, new: 20 }])).rejects.toThrow("INVALID_INPUT");
    expect(await item(itemRange)).toMatchObject({ quantity_min: 9, quantity_max: 11 });
  });

  it("permissões: aluno, professor de outro aluno, outra organização e anônimo não alteram nem leem o histórico", async () => {
    const ch = [{ item_id: itemLoad, field: "sets", old: 4, new: 5 }];
    await expect(apply(studentUser, ch)).rejects.toThrow("FORBIDDEN");
    await expect(apply(trainer2, ch)).rejects.toThrow("PLAN_NOT_FOUND");
    await expect(apply(ownerB, ch)).rejects.toThrow("PRESCRIPTION_ITEM_GONE");
    expect((await anon().rpc("apply_prescription_changes", { p_changes: ch, p_source: "quick" })).error).not.toBeNull();
    await expect(rpc(trainer2.client, "list_prescription_changes", { p_student_id: studentId })).rejects.toThrow("STUDENT_NOT_FOUND");
    await expect(rpc(ownerB.client, "list_prescription_changes", { p_student_id: studentId })).rejects.toThrow("STUDENT_NOT_FOUND");
    await expect(rpc(studentUser.client, "list_prescription_changes", { p_student_id: studentId })).rejects.toThrow("FORBIDDEN");
    // Tabela: só leitura pelo RLS; sem escrita direta.
    expect((await ownerB.client.from("prescription_changes").select("id").eq("student_id", studentId)).data).toHaveLength(0);
    expect((await trainer2.client.from("prescription_changes").select("id").eq("student_id", studentId)).data).toHaveLength(0);
    expect((await studentUser.client.from("prescription_changes").select("id")).data).toHaveLength(0);
    const { error } = await owner.client.from("prescription_changes").insert({ organization_id: org.id, batch_id: crypto.randomUUID(), student_id: studentId, workout_label: "A", exercise_name: "x", field: "sets", source: "quick" });
    expect(error).not.toBeNull();
    expect(await item(itemLoad)).toMatchObject({ sets: 4 });
  });

  it("desfazer: volta o lote inteiro, registra o desfazer, não desfaz duas vezes nem por cima de mudança posterior", async () => {
    const b = await apply(owner, [{ item_id: itemLoad, field: "load_value", old: 42.5, new: 50 }, { item_id: itemLoad, field: "sets", old: 4, new: 5 }]);
    const u = await rpc<{ batch_id: string; undone: number }>(trainer.client, "undo_prescription_batch", { p_batch_id: b.batch_id });
    expect(u.undone).toBe(2);
    expect(await item(itemLoad)).toMatchObject({ load_value: 42.5, sets: 4 });
    await expect(rpc(owner.client, "undo_prescription_batch", { p_batch_id: b.batch_id })).rejects.toThrow("ALREADY_UNDONE");
    const h = await rpc<Batch[]>(owner.client, "list_prescription_changes", { p_student_id: studentId });
    expect(h.find((x) => x.batch_id === b.batch_id)!.undone_at).not.toBeNull();
    expect(h.find((x) => x.batch_id === u.batch_id)!.source).toBe("undo");

    const b2 = await apply(owner, [{ item_id: itemLoad, field: "sets", old: 4, new: 6 }]);
    await apply(owner, [{ item_id: itemLoad, field: "sets", old: 6, new: 7 }]);
    await expect(rpc(owner.client, "undo_prescription_batch", { p_batch_id: b2.batch_id })).rejects.toThrow("PRESCRIPTION_CHANGED");
    await expect(rpc(trainer2.client, "undo_prescription_batch", { p_batch_id: b2.batch_id })).rejects.toThrow("NOT_FOUND");
    await expect(rpc(ownerB.client, "undo_prescription_batch", { p_batch_id: b2.batch_id })).rejects.toThrow("NOT_FOUND");
  });

  it("item recriado pelo montador (save do plano inteiro): histórico fica, desfazer avisa PRESCRIPTION_ITEM_GONE", async () => {
    const tmp = await addItem(workoutId, 9, { load_value: 5, load_unit: "kg" });
    const b = await apply(owner, [{ item_id: tmp, field: "load_value", old: 5, new: 7.5 }]);
    await fx.db.from("plan_workout_items").delete().eq("id", tmp);
    await expect(rpc(owner.client, "undo_prescription_batch", { p_batch_id: b.batch_id })).rejects.toThrow("PRESCRIPTION_ITEM_GONE");
    const h = await rpc<Batch[]>(owner.client, "list_prescription_changes", { p_student_id: studentId });
    expect(h.find((x) => x.batch_id === b.batch_id)).toMatchObject({ item_gone: true, undone_at: null });
  });

  it("sugestões: séries registradas na sessão concluída; aplicar com a sessão; 'Manter' some da revisão", async () => {
    const { data: ws } = await fx.db.from("workout_sessions").insert({
      organization_id: org.id, student_id: studentId, plan_id: planId, workout_id: workoutId, workout_label: "A", snapshot: {},
      status: "completed", started_at: new Date(Date.now() - 3_600_000).toISOString(), finished_at: new Date().toISOString(),
    }).select("id").single();
    const sessionId = ws!.id;
    const { data: il } = await fx.db.from("session_item_logs").insert({ organization_id: org.id, session_id: sessionId, item_id: itemLoad, exercise_id: exerciseId, exercise_name: "Ex" }).select("id").single();
    const { error: setErr } = await fx.db.from("session_set_logs").insert([1, 2, 3].map((k) => ({ organization_id: org.id, item_log_id: il!.id, set_index: k, load_value: 45, load_unit: "kg", quantity_value: 12 })));
    expect(setErr).toBeNull();

    const review = await rpc<{ plan_id: string; items: { item_id: string; session_id: string; logs: unknown[]; dismissed: string[] }[] }>(trainer.client, "get_prescription_review", { p_student_id: studentId });
    expect(review.plan_id).toBe(planId);
    const it0 = review.items.find((i) => i.item_id === itemLoad)!;
    expect(it0.session_id).toBe(sessionId);
    expect(it0.logs).toHaveLength(3);
    expect(JSON.stringify(review)).not.toMatch(/pain|feedback|note/);
    await expect(rpc(trainer2.client, "get_prescription_review", { p_student_id: studentId })).rejects.toThrow("STUDENT_NOT_FOUND");
    await expect(rpc(studentUser.client, "get_prescription_review", { p_student_id: studentId })).rejects.toThrow("FORBIDDEN");

    const cur = await item(itemLoad);
    await apply(trainer, [{ item_id: itemLoad, field: "load_value", old: Number(cur.load_value), new: 45 }], "suggestion", sessionId);
    expect((await item(itemLoad)).load_value).toBe(45);
    // Sessão de outro aluno não serve de origem.
    const other = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    const { data: ows } = await fx.db.from("workout_sessions").insert({ organization_id: org.id, student_id: other, workout_label: "A", snapshot: {}, status: "completed", finished_at: new Date().toISOString() }).select("id").single();
    await expect(apply(owner, [{ item_id: itemLoad, field: "load_value", old: 45, new: 47.5 }], "suggestion", ows!.id)).rejects.toThrow("INVALID_INPUT");

    await rpc(trainer.client, "dismiss_prescription_suggestion", { p_session_id: sessionId, p_item_id: itemLoad, p_field: "quantity" });
    const again = await rpc<{ items: { item_id: string; dismissed: string[] }[] }>(trainer.client, "get_prescription_review", { p_student_id: studentId, p_session_id: sessionId });
    expect(again.items.find((i) => i.item_id === itemLoad)!.dismissed).toEqual(["quantity"]);
    await expect(rpc(ownerB.client, "dismiss_prescription_suggestion", { p_session_id: sessionId, p_item_id: itemLoad, p_field: "quantity" })).rejects.toThrow("SESSION_NOT_FOUND");
  });

  it("passo da carga: só o personal muda, com limites; equipe não grava a coluna direto", async () => {
    expect((await fx.db.from("organizations").select("load_step").eq("id", org.id).single()).data!.load_step).toBe(2.5);
    await expect(rpc(trainer.client, "set_load_step", { p_step: 1 })).rejects.toThrow("FORBIDDEN");
    await expect(rpc(owner.client, "set_load_step", { p_step: 0.1 })).rejects.toThrow("INVALID_INPUT");
    await rpc(owner.client, "set_load_step", { p_step: 1.25 });
    await owner.client.from("organizations").update({ load_step: 9 }).eq("id", org.id);
    expect((await fx.db.from("organizations").select("load_step").eq("id", org.id).single()).data!.load_step).toBe(1.25);
    await rpc(owner.client, "set_load_step", { p_step: 2.5 });
  });

  it("conta somente leitura: nada grava", async () => {
    await fx.db.from("organizations").update({ subscription_status: "suspended", status_changed_at: new Date().toISOString() }).eq("id", org.id);
    try {
      await expect(apply(owner, [{ item_id: itemLoad, field: "sets", old: 7, new: 8 }])).rejects.toThrow("ACCOUNT_READ_ONLY");
    } finally {
      await fx.db.from("organizations").update({ subscription_status: "active" }).eq("id", org.id);
    }
  });
});
