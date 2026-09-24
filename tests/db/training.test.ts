import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, spDateDaysAgo, studentData, type TestOrg, type TestUser } from "./helpers";

type Alert = { item_id: string | null; level: string | null; note: string | null; condition_name: string | null; group_name: string | null; hidden: boolean };

describe.runIf(dbTestsEnabled)("Fase 2: biblioteca, condições, planos e alertas", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, trainer: TestUser, trainer2: TestUser, student: TestUser, ownerB: TestUser;
  let s1: string, s2: string;
  let lombar: string, joelho: string;
  const ex: Record<string, string> = {};
  let exB: string, groupA: string, groupB: string;

  const globalEx = async (name: string) => {
    const { data } = await fx.db.from("exercises").select("id").is("organization_id", null).eq("name", name).single();
    return data!.id as string;
  };

  const structure = async (planId: string) => {
    const { data: ws } = await fx.db.from("plan_workouts").select("id, label, position").eq("plan_id", planId).order("position");
    const out = [];
    for (const w of ws ?? []) {
      const { data: items } = await fx.db
        .from("plan_workout_items")
        .select("id, exercise_id, position, group_key, sets, reps, load_value, load_unit")
        .eq("workout_id", w.id)
        .order("position");
      const withSets = [];
      for (const i of items ?? []) {
        const { data: sets } = await fx.db.from("plan_item_sets").select("position, set_type, reps, load_value, load_unit").eq("item_id", i.id).order("position");
        withSets.push({ exercise_id: i.exercise_id, group_key: i.group_key, sets: i.sets, reps: i.reps, load_value: i.load_value, load_unit: i.load_unit, sets_detail: sets });
      }
      out.push({ label: w.label, items: withSets });
    }
    return out;
  };

  const planPayload = (studentId: string | null, extra: Record<string, unknown> = {}) => ({
    student_id: studentId,
    name: "Treino ABC",
    goal: "Hipertrofia",
    level: "intermediario",
    workouts: [
      {
        label: "A",
        name: "Peito e tríceps",
        items: [
          { exercise_id: ex.supra, sets: 3, reps: "15" },
          { exercise_id: ex.supino, group_key: "g1", sets: 4, reps: "8–12", load_value: 40, load_unit: "kg" },
          { exercise_id: ex.triceps, group_key: "g1", sets: 4, reps: "10" },
          {
            exercise_id: ex.agacho,
            reps: "10",
            sets_detail: [
              { set_type: "warmup", reps: "15", load_text: "barra vazia" },
              { set_type: "work", reps: "8", load_value: 60, load_unit: "kg" },
              { set_type: "drop", reps: "até a falha", load_value: 40, load_unit: "kg" },
            ],
          },
        ],
      },
      { label: "B", items: [{ exercise_id: ex.remada, sets: 3, reps: "12" }] },
    ],
    ...extra,
  });

  beforeAll(async () => {
    org = await fx.org("training");
    orgB = await fx.org("training-b");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer", "trainer1");
    trainer2 = await fx.user(org, "trainer", "trainer2");
    student = await fx.user(org, "student");
    ownerB = await fx.user(orgB, "owner");

    s1 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData({ trainer_id: trainer.id }) })).id;
    s2 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData({ trainer_id: trainer2.id }) })).id;
    await fx.db.from("students").update({ trainer_id: trainer.id }).eq("id", s1);
    await fx.db.from("students").update({ trainer_id: trainer2.id }).eq("id", s2);

    const conds = await fx.db.from("health_conditions").select("id, key").in("key", ["lombar", "joelho"]);
    lombar = conds.data!.find((c) => c.key === "lombar")!.id;
    joelho = conds.data!.find((c) => c.key === "joelho")!.id;

    ex.supra = await globalEx("Abdominal supra");
    ex.supino = await globalEx("Supino reto com barra");
    ex.triceps = await globalEx("Tríceps na polia");
    ex.agacho = await globalEx("Agachamento livre com barra");
    ex.remada = await globalEx("Remada baixa sentada na polia");

    groupA = await fx.group(org, "Dor na Coluna");
    groupB = await fx.group(orgB, "Joelho B");
    await fx.db.from("special_group_conditions").insert({ organization_id: org.id, group_id: groupA, condition_id: lombar });
    await fx.db.from("student_groups").insert({ organization_id: org.id, student_id: s1, group_id: groupA });

    const { data } = await ownerB.client.from("exercises").insert({ organization_id: orgB.id, name: "Exercício da org B" }).select("id").single();
    exB = data!.id;
  });
  afterAll(() => fx.cleanup());

  describe("biblioteca global e condições", () => {
    it("staff lê a biblioteca global (~50) e o catálogo de condições", async () => {
      const { count } = await trainer.client.from("exercises").select("id", { count: "exact", head: true }).is("organization_id", null);
      expect(count).toBeGreaterThanOrEqual(50);
      const { count: c } = await trainer.client.from("health_conditions").select("id", { count: "exact", head: true }).is("organization_id", null);
      expect(c).toBe(11);
    });

    it("biblioteca global sem contraindicações pré-marcadas", async () => {
      const { count } = await fx.db.from("exercise_contraindications").select("id", { count: "exact", head: true }).is("organization_id", null);
      expect(count).toBe(0);
    });

    it("global é somente leitura para a organização", async () => {
      const upd = await owner.client.from("exercises").update({ name: "Hack" }).eq("id", ex.supra).select("id");
      expect(upd.data ?? []).toHaveLength(0);
      const del = await owner.client.from("exercises").delete().eq("id", ex.supra).select("id");
      // Exclusão definitiva vale só para exercícios da própria org (RLS): no global afeta 0 linhas.
      expect(del.data ?? []).toHaveLength(0);
      expect((await owner.client.from("exercises").insert({ organization_id: null, name: "Global falso" })).error).not.toBeNull();
      expect((await owner.client.from("health_conditions").insert({ organization_id: null, name: "Global falsa" })).error).not.toBeNull();
      expect(
        (await owner.client.from("exercise_contraindications").insert({ organization_id: null, exercise_id: ex.supino, condition_id: lombar, level: "avoid" })).error,
      ).not.toBeNull();
      const cu = await owner.client.from("health_conditions").update({ name: "Hack" }).eq("id", lombar).select("id");
      expect(cu.data ?? []).toHaveLength(0);
      const { data } = await fx.db.from("exercises").select("name").eq("id", ex.supra).single();
      expect(data!.name).toBe("Abdominal supra");
    });

    it("aluno e anônimo não leem a biblioteca", async () => {
      expect((await student.client.from("exercises").select("id").limit(1)).data ?? []).toHaveLength(0);
      expect((await anon().from("exercises").select("id").limit(1)).data ?? []).toHaveLength(0);
      expect((await student.client.from("health_conditions").select("id").limit(1)).data ?? []).toHaveLength(0);
    });

    it("exercício próprio: isolado por organização; edição só owner ou autor", async () => {
      const { data, error } = await trainer.client
        .from("exercises")
        .insert({ organization_id: org.id, name: "Stiff unilateral adaptado", muscle_groups: ["posteriores", "gluteos"] })
        .select("id, created_by")
        .single();
      expect(error).toBeNull();
      expect(data!.created_by).toBe(trainer.id);

      expect((await ownerB.client.from("exercises").select("id").eq("id", data!.id)).data).toHaveLength(0);
      expect((await trainer2.client.from("exercises").update({ name: "Outro" }).eq("id", data!.id).select("id")).data ?? []).toHaveLength(0);
      expect((await owner.client.from("exercises").update({ equipment: "Halter" }).eq("id", data!.id).select("id")).data).toHaveLength(1);
      // Não é possível forjar o autor nem criar em outra organização.
      expect((await trainer.client.from("exercises").insert({ organization_id: org.id, name: "Forjado", created_by: owner.id })).error).not.toBeNull();
      expect((await trainer.client.from("exercises").insert({ organization_id: orgB.id, name: "Invasão" })).error).not.toBeNull();
    });

    it("valida grupos musculares e URL de vídeo", async () => {
      expect((await trainer.client.from("exercises").insert({ organization_id: org.id, name: "X1", muscle_groups: ["peito"] })).error).not.toBeNull();
      expect((await trainer.client.from("exercises").insert({ organization_id: org.id, name: "X2", video_url: "http://example.com/v" })).error).not.toBeNull();
      expect(
        (await trainer.client.from("exercises").insert({ organization_id: org.id, name: "X3", video_url: "https://www.youtube.com/watch?v=abc" })).error,
      ).toBeNull();
    });

    it("condição própria: isolada, usável só pela própria org e arquivada só pelo owner", async () => {
      const { data, error } = await trainer.client
        .from("health_conditions")
        .insert({ organization_id: org.id, name: "Hérnia – intolerância à flexão" })
        .select("id")
        .single();
      expect(error).toBeNull();
      const own = data!.id;

      expect((await ownerB.client.from("health_conditions").select("id").eq("id", own)).data).toHaveLength(0);
      expect((await ownerB.client.from("special_group_conditions").insert({ organization_id: orgB.id, group_id: groupB, condition_id: own })).error).not.toBeNull();
      expect(
        (await ownerB.client.from("exercise_contraindications").insert({ organization_id: orgB.id, exercise_id: exB, condition_id: own, level: "avoid" })).error,
      ).not.toBeNull();

      const tArchive = await trainer.client.from("health_conditions").update({ archived_at: new Date().toISOString() }).eq("id", own);
      expect(tArchive.error).not.toBeNull();
      const oArchive = await owner.client.from("health_conditions").update({ archived_at: new Date().toISOString() }).eq("id", own).select("id");
      expect(oArchive.error).toBeNull();
      expect(oArchive.data).toHaveLength(1);
    });

    it("contraindicação da org sobre exercício global fica na camada da org", async () => {
      const { error } = await trainer.client.from("exercise_contraindications").insert({
        organization_id: org.id,
        exercise_id: ex.supra,
        condition_id: lombar,
        level: "avoid",
        note: "Flexão lombar repetida",
      });
      expect(error).toBeNull();
      await trainer.client.from("exercise_contraindications").insert({
        organization_id: org.id,
        exercise_id: ex.agacho,
        condition_id: lombar,
        level: "caution",
        note: "Carga axial",
      });
      expect((await ownerB.client.from("exercise_contraindications").select("id").eq("exercise_id", ex.supra)).data).toHaveLength(0);
      // Exercício de outra organização não pode receber regra.
      expect(
        (await trainer.client.from("exercise_contraindications").insert({ organization_id: org.id, exercise_id: exB, condition_id: joelho, level: "avoid" })).error,
      ).not.toBeNull();
    });
  });

  describe("planos de treino", () => {
    let planId: string;

    it("escrita direta nas tabelas de plano é recusada (só via RPC)", async () => {
      expect((await trainer.client.from("training_plans").insert({ organization_id: org.id, student_id: s1, name: "Direto" })).error).not.toBeNull();
    });

    it("salva plano com agrupamento e séries detalhadas", async () => {
      planId = await rpc<string>(trainer.client, "save_training_plan", { p_plan: planPayload(s1) });
      const s = await structure(planId);
      expect(s.map((w) => w.label)).toEqual(["A", "B"]);
      expect(s[0].items.map((i) => i.group_key)).toEqual([null, "g1", "g1", null]);
      expect(s[0].items[1]).toMatchObject({ load_value: 40, load_unit: "kg", reps: "8–12" });
      expect(s[0].items[3].sets_detail!.map((x) => x.set_type)).toEqual(["warmup", "work", "drop"]);

      const { data } = await fx.db.from("audit_logs").select("action").eq("entity_id", planId);
      expect(data!.map((a) => a.action)).toContain("plan.saved");
    });

    it("editar substitui a estrutura inteira", async () => {
      const payload = planPayload(s1, { id: planId });
      payload.workouts = [payload.workouts[1]];
      await rpc(trainer.client, "save_training_plan", { p_plan: payload });
      expect((await structure(planId)).map((w) => w.label)).toEqual(["B"]);
      await rpc(trainer.client, "save_training_plan", { p_plan: planPayload(s1, { id: planId }) });
    });

    it("agrupamento não contíguo e exercício de outra org são recusados", async () => {
      const bad = planPayload(s1);
      bad.workouts[0].items = [
        { exercise_id: ex.supino, group_key: "g1", sets: 3, reps: "10" },
        { exercise_id: ex.supra, sets: 3, reps: "10" },
        { exercise_id: ex.triceps, group_key: "g1", sets: 3, reps: "10" },
      ];
      await expect(rpc(trainer.client, "save_training_plan", { p_plan: bad })).rejects.toThrow("INVALID_GROUP_ORDER");

      const foreign = planPayload(s1);
      foreign.workouts[0].items = [{ exercise_id: exB, sets: 3, reps: "10" }];
      await expect(rpc(trainer.client, "save_training_plan", { p_plan: foreign })).rejects.toThrow("INVALID_EXERCISE");
    });

    it("trainer não vê nem edita plano de aluno de outro trainer; outra org também não", async () => {
      expect((await trainer2.client.from("training_plans").select("id").eq("id", planId)).data).toHaveLength(0);
      expect((await trainer2.client.from("plan_workouts").select("id").eq("plan_id", planId)).data).toHaveLength(0);
      await expect(rpc(trainer2.client, "save_training_plan", { p_plan: planPayload(s1, { id: planId }) })).rejects.toThrow("PLAN_NOT_FOUND");
      await expect(rpc(trainer2.client, "save_training_plan", { p_plan: planPayload(s1) })).rejects.toThrow(/STUDENT_NOT_FOUND|FORBIDDEN/);
      expect((await ownerB.client.from("training_plans").select("id").eq("id", planId)).data).toHaveLength(0);
      await expect(rpc(ownerB.client, "plan_contraindication_alerts", { p_plan_id: planId })).rejects.toThrow("PLAN_NOT_FOUND");
      expect((await owner.client.from("training_plans").select("id").eq("id", planId)).data).toHaveLength(1);
    });

    it("alertas com nível e nota para o responsável", async () => {
      const alerts = await rpc<Alert[]>(trainer.client, "plan_contraindication_alerts", { p_plan_id: planId });
      expect(alerts.every((a) => !a.hidden)).toBe(true);
      const byLevel = Object.fromEntries(alerts.map((a) => [a.level, a]));
      expect(byLevel.avoid).toMatchObject({ note: "Flexão lombar repetida", condition_name: "Coluna lombar", group_name: "Dor na Coluna" });
      expect(byLevel.caution).toMatchObject({ note: "Carga axial" });
      expect(alerts).toHaveLength(2);

      const rules = await rpc<Alert[]>(trainer.client, "student_contraindication_rules", { p_student_id: s1 });
      expect(rules).toHaveLength(2);
    });

    it("regra global (aprovada) soma com a da org", async () => {
      const { data } = await fx.db
        .from("exercise_contraindications")
        .insert({ organization_id: null, exercise_id: ex.remada, condition_id: lombar, level: "caution", note: "Regra global de teste" })
        .select("id")
        .single();
      try {
        const alerts = await rpc<Alert[]>(trainer.client, "plan_contraindication_alerts", { p_plan_id: planId });
        expect(alerts.map((a) => a.note)).toContain("Regra global de teste");
        expect(alerts).toHaveLength(3);
      } finally {
        await fx.db.from("exercise_contraindications").delete().eq("id", data!.id);
      }
    });

    it("sem consentimento do titular, owner não responsável só vê 'oculto'", async () => {
      const alerts = await rpc<Alert[]>(owner.client, "plan_contraindication_alerts", { p_plan_id: planId });
      expect(alerts).toEqual([{ item_id: null, exercise_id: null, substitute: null, level: null, note: null, condition_name: null, group_name: null, hidden: true }]);
      const rules = await rpc<Alert[]>(owner.client, "student_contraindication_rules", { p_student_id: s1 });
      expect(rules).toHaveLength(1);
      expect(rules[0].hidden).toBe(true);

      await fx.db.from("students").update({ health_data_consent_at: new Date().toISOString() }).eq("id", s1);
      try {
        const after = await rpc<Alert[]>(owner.client, "plan_contraindication_alerts", { p_plan_id: planId });
        expect(after).toHaveLength(2);
        expect(after.every((a) => !a.hidden)).toBe(true);
      } finally {
        await fx.db.from("students").update({ health_data_consent_at: null }).eq("id", s1);
      }
    });

    it("ativar exige datas, sincroniza o vencimento e mantém 1 ativo por aluno", async () => {
      await expect(rpc(trainer.client, "activate_plan", { p_plan_id: planId })).rejects.toThrow("PLAN_DATES_REQUIRED");

      // Início no passado → ativa na hora (início futuro agenda; ver training-2-8.test.ts).
      const end1 = spDateDaysAgo(-60), end2 = spDateDaysAgo(-120);
      await rpc(trainer.client, "save_training_plan", { p_plan: planPayload(s1, { id: planId, starts_on: spDateDaysAgo(30), ends_on: end1 }) });
      await rpc(trainer.client, "activate_plan", { p_plan_id: planId });
      const read = async () => (await fx.db.from("students").select("workout_plan_ends_at").eq("id", s1).single()).data!.workout_plan_ends_at;
      expect(new Date(await read()).toISOString()).toBe(new Date(`${end1}T23:59:59-03:00`).toISOString());

      const second = await rpc<string>(trainer.client, "save_training_plan", {
        p_plan: planPayload(s1, { name: "Treino novo", starts_on: spDateDaysAgo(1), ends_on: end2 }),
      });
      await rpc(trainer.client, "activate_plan", { p_plan_id: second });
      const { data } = await fx.db.from("training_plans").select("id, status").eq("student_id", s1);
      expect(data!.filter((p) => p.status === "active").map((p) => p.id)).toEqual([second]);
      expect(data!.find((p) => p.id === planId)!.status).toBe("archived");
      expect(new Date(await read()).toISOString()).toBe(new Date(`${end2}T23:59:59-03:00`).toISOString());

      await rpc(trainer.client, "archive_plan", { p_plan_id: second });
      expect(await read()).toBeNull();
      await expect(rpc(trainer.client, "save_training_plan", { p_plan: planPayload(s1, { id: second }) })).rejects.toThrow("PLAN_ARCHIVED");
    });

    it("modelo: salvar como modelo, aplicar e duplicar preservam agrupamentos e séries", async () => {
      const original = await structure(planId);
      const templateId = await rpc<string>(trainer.client, "save_plan_as_template", { p_plan_id: planId, p_name: "Hipertrofia ABC" });
      const { data: tpl } = await fx.db.from("training_plans").select("student_id, status, created_by, name").eq("id", templateId).single();
      expect(tpl).toMatchObject({ student_id: null, status: "draft", created_by: trainer.id, name: "Hipertrofia ABC" });
      expect(await structure(templateId)).toEqual(original);

      // Modelo é visível à organização toda; trainer2 aplica ao próprio aluno.
      expect((await trainer2.client.from("training_plans").select("id").eq("id", templateId)).data).toHaveLength(1);
      const applied = await rpc<string>(trainer2.client, "apply_template_to_student", {
        p_template_id: templateId,
        p_student_id: s2,
        p_starts_on: "2026-10-01",
        p_ends_on: "2026-10-31",
      });
      expect(await structure(applied)).toEqual(original);
      const { data: ap } = await fx.db.from("training_plans").select("student_id, starts_on, source_plan_id").eq("id", applied).single();
      expect(ap).toMatchObject({ student_id: s2, starts_on: "2026-10-01", source_plan_id: templateId });

      // Mas não aplica a aluno de outro trainer, nem edita modelo de outro autor.
      await expect(rpc(trainer2.client, "apply_template_to_student", { p_template_id: templateId, p_student_id: s1 })).rejects.toThrow(
        /STUDENT_NOT_FOUND|FORBIDDEN/,
      );
      await expect(rpc(trainer2.client, "save_training_plan", { p_plan: planPayload(null, { id: templateId }) })).rejects.toThrow("PLAN_NOT_FOUND");
      // Modelo não é ativado.
      await expect(rpc(owner.client, "activate_plan", { p_plan_id: templateId })).rejects.toThrow("INVALID_INPUT");

      const dup = await rpc<string>(trainer.client, "duplicate_plan", { p_plan_id: planId });
      expect(await structure(dup)).toEqual(original);
      const { data: d } = await fx.db.from("training_plans").select("name, status, student_id").eq("id", dup).single();
      expect(d).toMatchObject({ status: "draft", student_id: s1 });
      expect(d!.name).toMatch(/\(cópia\)$/);
    });

    it("modelos não aparecem para outra organização", async () => {
      expect((await ownerB.client.from("training_plans").select("id").eq("organization_id", org.id)).data).toHaveLength(0);
    });
  });

  describe("aluno e anônimo são recusados nas RPCs novas", () => {
    let planId: string, tplId: string;
    beforeAll(async () => {
      planId = await rpc<string>(owner.client, "save_training_plan", { p_plan: planPayload(s1, { name: "Plano X" }) });
      tplId = await rpc<string>(owner.client, "save_training_plan", { p_plan: planPayload(null, { name: "Modelo X" }) });
    });

    const calls: [string, () => Record<string, unknown>][] = [
      ["save_training_plan", () => ({ p_plan: planPayload(s1) })],
      ["save_training_plan", () => ({ p_plan: planPayload(s1, { id: planId }) })],
      ["activate_plan", () => ({ p_plan_id: planId })],
      ["archive_plan", () => ({ p_plan_id: planId })],
      ["apply_template_to_student", () => ({ p_template_id: tplId, p_student_id: s1 })],
      ["save_plan_as_template", () => ({ p_plan_id: planId, p_name: "Roubo" })],
      ["duplicate_plan", () => ({ p_plan_id: planId })],
      ["student_contraindication_rules", () => ({ p_student_id: s1 })],
      ["plan_contraindication_alerts", () => ({ p_plan_id: planId })],
    ];

    it.each(calls)("%s falha para o aluno", async (fn, args) => {
      await expect(rpc(student.client, fn, args())).rejects.toThrow(/FORBIDDEN|NOT_FOUND/);
    });

    it.each(calls)("%s falha para anônimo", async (fn, args) => {
      const { error } = await anon().rpc(fn, args());
      expect(error).not.toBeNull();
    });

    it("nada mudou", async () => {
      const { data } = await fx.db.from("training_plans").select("status").eq("id", planId).single();
      expect(data!.status).toBe("draft");
      const { count } = await fx.db.from("audit_logs").select("id", { count: "exact", head: true }).eq("actor_id", student.id);
      expect(count).toBe(0);
    });
  });
});
