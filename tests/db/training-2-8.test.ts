import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, spDateDaysAgo, studentData, type TestOrg, type TestUser } from "./helpers";

type Row = Record<string, unknown>;

describe.runIf(dbTestsEnabled)("Etapa 2.8: plano, prescrição, substitutos, listas, padrões, cópia em massa", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, trainer: TestUser, trainer2: TestUser, student: TestUser, ownerB: TestUser;
  let s1: string, s2: string, s3: string, sB: string;
  const ex: Record<string, string> = {};
  let exB: string, lombar: string;

  const globalEx = async (name: string) =>
    (await fx.db.from("exercises").select("id").is("organization_id", null).eq("name", name).single()).data!.id as string;
  const item = (exercise: string, extra: Row = {}) => ({ exercise_id: exercise, sets: 3, quantity_unit: "reps", quantity_min: 10, quantity_max: 12, ...extra });
  const plan = (studentId: string | null, items: Row[], extra: Row = {}) => ({
    student_id: studentId,
    name: "Plano 2.8",
    workouts: [{ label: "A", items }],
    ...extra,
  });
  const firstItem = async (planId: string) => {
    const { data: w } = await fx.db.from("plan_workouts").select("id").eq("plan_id", planId).order("position").limit(1).single();
    const { data } = await fx.db.from("plan_workout_items").select("*").eq("workout_id", w!.id).order("position").limit(1).single();
    return data as Row;
  };

  beforeAll(async () => {
    org = await fx.org("t28");
    orgB = await fx.org("t28-b");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer", "t1");
    trainer2 = await fx.user(org, "trainer", "t2");
    student = await fx.user(org, "student");
    ownerB = await fx.user(orgB, "owner");
    s1 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    s2 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    s3 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    sB = (await rpc<{ id: string }>(ownerB.client, "create_student", { p_data: studentData() })).id;
    await fx.db.from("students").update({ trainer_id: trainer.id }).in("id", [s1, s3]);
    await fx.db.from("students").update({ trainer_id: trainer2.id }).eq("id", s2);
    ex.supra = await globalEx("Abdominal supra");
    ex.prancha = await globalEx("Prancha frontal");
    ex.deadbug = await globalEx("Dead bug");
    ex.supino = await globalEx("Supino reto com barra");
    exB = await rpc<string>(ownerB.client, "save_exercise", { p_id: null, p_data: { name: "Só da B", muscle_groups: ["abdomen"] }, p_rules: [] });
    lombar = (await fx.db.from("health_conditions").select("id").eq("key", "lombar").single()).data!.id;
  });
  afterAll(() => fx.cleanup());

  describe("plano: sem expiração, sessões, professor do plano, agendamento", () => {
    it("sem data de expiração → 'infinity': fora de A vencer/Vencidos e não conta como Sem treino", async () => {
      const id = await rpc<string>(owner.client, "save_training_plan", {
        p_plan: plan(s3, [item(ex.supra)], { starts_on: spDateDaysAgo(3), ends_on: spDateDaysAgo(-10), no_end: true, planned_sessions: 24 }),
      });
      const { data: p } = await fx.db.from("training_plans").select("ends_on, no_end, planned_sessions, trainer_id").eq("id", id).single();
      expect(p).toEqual({ ends_on: null, no_end: true, planned_sessions: 24, trainer_id: trainer.id }); // padrão = professor do aluno
      expect(await rpc(owner.client, "activate_plan", { p_plan_id: id })).toBe("active");
      const { data: st } = await fx.db.from("students").select("workout_plan_ends_at").eq("id", s3).single();
      expect(st!.workout_plan_ends_at).toBe("infinity");
      const [c] = await rpc<{ expiring: number; expired: number; no_plan: number }[]>(owner.client, "student_plan_counts");
      expect(Number(c.no_plan)).toBe(2); // s1 e s2; s3 tem plano sem expiração
    });

    it("sessões previstas fora de 1–500 recusadas; ativar sem fim e sem 'sem expiração' recusa", async () => {
      await expect(rpc(owner.client, "save_training_plan", { p_plan: plan(s3, [], { planned_sessions: 0 }) })).rejects.toThrow();
      const id = await rpc<string>(owner.client, "save_training_plan", { p_plan: plan(s3, [], { starts_on: spDateDaysAgo(1) }) });
      await expect(rpc(owner.client, "activate_plan", { p_plan_id: id })).rejects.toThrow("PLAN_DATES_REQUIRED");
    });

    it("professor do plano vê e edita só aquele plano; sem cadastro nem saúde do aluno", async () => {
      await fx.db.from("special_groups").insert({ organization_id: org.id, name: "Coluna 2.8" });
      const { data: g } = await fx.db.from("special_groups").select("id").eq("organization_id", org.id).eq("name", "Coluna 2.8").single();
      await fx.db.from("special_group_conditions").insert({ organization_id: org.id, group_id: g!.id, condition_id: lombar });
      await fx.db.from("student_groups").insert({ organization_id: org.id, student_id: s1, group_id: g!.id });
      await fx.db.from("exercise_contraindications").insert({ organization_id: org.id, exercise_id: ex.supra, condition_id: lombar, level: "avoid", note: "Flexão" });

      const other = await rpc<string>(trainer.client, "save_training_plan", { p_plan: plan(s1, [item(ex.supino)], { name: "Outro plano" }) });
      const id = await rpc<string>(trainer.client, "save_training_plan", { p_plan: plan(s1, [item(ex.supra)], { trainer_id: trainer2.id }) });

      expect((await trainer2.client.from("training_plans").select("id").eq("id", id)).data).toHaveLength(1);
      expect((await trainer2.client.from("training_plans").select("id").eq("id", other)).data).toHaveLength(0);
      expect((await trainer2.client.from("students").select("id").eq("id", s1)).data).toHaveLength(0);
      const [h] = await rpc<{ student_name: string; trainer_id: string }[]>(trainer2.client, "get_plan_header", { p_plan_id: id });
      expect(h.student_name).toMatch(/Aluno Teste/);
      expect(h.trainer_id).toBe(trainer2.id);
      // Edita o plano (mantendo-se como professor).
      await rpc(trainer2.client, "save_training_plan", { p_plan: plan(s1, [item(ex.supra), item(ex.prancha)], { id, trainer_id: trainer2.id }) });
      // Saúde restrita para ele: só o nível, sem condição/grupo/nota. Detalhe completo para o responsável.
      const restricted = await rpc<Row[]>(trainer2.client, "plan_contraindication_alerts", { p_plan_id: id });
      expect(restricted).toEqual([
        expect.objectContaining({ level: "avoid", condition_name: null, note: null, group_name: null, hidden: false, restricted: true }),
      ]);
      expect(await rpc<Row[]>(trainer2.client, "student_contraindication_rules", { p_student_id: s1 })).toEqual([
        expect.objectContaining({ level: "avoid", condition_name: null, note: null, group_name: null, hidden: false, restricted: true }),
      ]);
      const visible = await rpc<Row[]>(trainer.client, "plan_contraindication_alerts", { p_plan_id: id });
      expect(visible).toEqual([expect.objectContaining({ level: "avoid", note: "Flexão", substitute: false, hidden: false, restricted: false })]);
      // Professor de outra org ou perfil de aluno não podem ser professor do plano.
      await expect(rpc(trainer.client, "save_training_plan", { p_plan: plan(s1, [], { trainer_id: student.id }) })).rejects.toThrow("INVALID_TRAINER");
      await expect(rpc(trainer.client, "save_training_plan", { p_plan: plan(s1, [], { trainer_id: ownerB.id }) })).rejects.toThrow("INVALID_TRAINER");
    });

    it("owner sem ser responsável: consentimento apenas declarado gera alerta restrito, não oculto; detalhe só após confirmação do titular", async () => {
      // s1: trainer_id = trainer.id (owner não é responsável); grupo "Coluna 2.8" ↔ lombar e a
      // contraindicação em ex.supra já foram configurados no teste anterior.
      await fx.db.from("students").update({ health_consent_declared_at: null, health_data_consent_at: null }).eq("id", s1);
      const planId = await rpc<string>(trainer.client, "save_training_plan", { p_plan: plan(s1, [item(ex.supra)]) });

      // Nada declarado ainda → oculto (owner não vê nem o nível).
      const beforeDecl = await rpc<Row[]>(owner.client, "plan_contraindication_alerts", { p_plan_id: planId });
      expect(beforeDecl).toEqual([expect.objectContaining({ hidden: true, restricted: false, level: null, condition_name: null })]);

      // Professor declara (sem confirmação do titular) → owner passa a ver "restrito": nível, sem detalhes.
      await fx.db.from("students").update({ health_consent_declared_at: new Date().toISOString() }).eq("id", s1);
      try {
        const restricted = await rpc<Row[]>(owner.client, "plan_contraindication_alerts", { p_plan_id: planId });
        expect(restricted).toEqual([
          expect.objectContaining({ level: "avoid", condition_name: null, note: null, group_name: null, hidden: false, restricted: true }),
        ]);
        // Nenhum dado de saúde identificável vaza para o owner nesse estágio.
        for (const row of restricted) {
          expect(row.note).toBeNull();
          expect(row.condition_name).toBeNull();
          expect(row.group_name).toBeNull();
        }
        const rules = await rpc<Row[]>(owner.client, "student_contraindication_rules", { p_student_id: s1 });
        expect(rules).toEqual([expect.objectContaining({ level: "avoid", condition_name: null, note: null, group_name: null, hidden: false, restricted: true })]);

        // O responsável sempre viu o detalhe completo, com ou sem confirmação do titular.
        const forResponsible = await rpc<Row[]>(trainer.client, "plan_contraindication_alerts", { p_plan_id: planId });
        expect(forResponsible).toEqual([
          expect.objectContaining({ level: "avoid", note: "Flexão", condition_name: "Coluna lombar", group_name: "Coluna 2.8", hidden: false, restricted: false }),
        ]);

        // Confirmação do titular → owner passa a ver o detalhe completo também.
        await fx.db.from("students").update({ health_data_consent_at: new Date().toISOString() }).eq("id", s1);
        const full = await rpc<Row[]>(owner.client, "plan_contraindication_alerts", { p_plan_id: planId });
        expect(full).toEqual([
          expect.objectContaining({ level: "avoid", note: "Flexão", condition_name: "Coluna lombar", group_name: "Coluna 2.8", hidden: false, restricted: false }),
        ]);
      } finally {
        await fx.db.from("students").update({ health_consent_declared_at: null, health_data_consent_at: null }).eq("id", s1);
      }
    });

    it("agendado: início futuro agenda; sem sobreposição; o job ativa na data e arquiva o anterior", async () => {
      const current = await rpc<string>(owner.client, "save_training_plan", { p_plan: plan(s2, [item(ex.supra)], { starts_on: spDateDaysAgo(20), ends_on: spDateDaysAgo(-5) }) });
      expect(await rpc(owner.client, "activate_plan", { p_plan_id: current })).toBe("active");
      const next = await rpc<string>(owner.client, "save_training_plan", { p_plan: plan(s2, [item(ex.supra)], { starts_on: spDateDaysAgo(-6), ends_on: spDateDaysAgo(-40) }) });
      expect(await rpc(owner.client, "activate_plan", { p_plan_id: next })).toBe("scheduled");
      const overlap = await rpc<string>(owner.client, "save_training_plan", { p_plan: plan(s2, [], { starts_on: spDateDaysAgo(-30), ends_on: spDateDaysAgo(-60) }) });
      await expect(rpc(owner.client, "activate_plan", { p_plan_id: overlap })).rejects.toThrow("PLAN_OVERLAP");
      const later = await rpc<string>(owner.client, "save_training_plan", { p_plan: plan(s2, [], { starts_on: spDateDaysAgo(-41), no_end: true }) });
      expect(await rpc(owner.client, "activate_plan", { p_plan_id: later })).toBe("scheduled");

      // Simula a chegada da data e roda o job (o mesmo do pg_cron).
      await fx.db.from("training_plans").update({ starts_on: spDateDaysAgo(0) }).eq("id", next);
      expect(await rpc<number>(fx.db, "admin_activate_due_plans")).toBeGreaterThanOrEqual(1);
      const { data } = await fx.db.from("training_plans").select("id, status").in("id", [current, next, later]);
      const status = Object.fromEntries(data!.map((r) => [r.id, r.status]));
      expect(status).toEqual({ [current]: "archived", [next]: "active", [later]: "scheduled" });
      // Job não é chamável por usuários.
      expect((await owner.client.rpc("admin_activate_due_plans")).error).not.toBeNull();
    });
  });

  describe("prescrição nova e compatibilidade com o formato antigo", () => {
    it("campos novos gravados (colunas legadas removidas)", async () => {
      const id = await rpc<string>(owner.client, "save_training_plan", {
        p_plan: plan(null, [
          item(ex.prancha, { quantity_unit: "seconds", quantity_min: 20, quantity_max: 30, intensity_type: "rpe", intensity_value: 7.5, speed: "slow", rest_min: 60, rest_max: 90, tip: "**Coluna neutra**\n- respire" }),
        ]),
      });
      const it = await firstItem(id);
      expect(it).toMatchObject({
        quantity_unit: "seconds", quantity_min: 20, quantity_max: 30, intensity_type: "rpe", intensity_value: 7.5, speed: "slow", rest_min: 60, rest_max: 90,
        tip: "**Coluna neutra**\n- respire",
      });
      for (const legacy of ["reps", "rest_seconds", "rpe_target", "notes"]) expect(it).not.toHaveProperty(legacy);
    });

    it("formato antigo na entrada (reps/rest_seconds/rpe_target/notes) continua aceito e é convertido", async () => {
      const id = await rpc<string>(owner.client, "save_training_plan", {
        p_plan: plan(null, [{ exercise_id: ex.deadbug, sets: 3, reps: "8 por lado", rest_seconds: 45, rpe_target: 8, notes: "Lento", sets_detail: [{ set_type: "work", reps: "até a falha", rest_seconds: 30 }] }]),
      });
      const it = await firstItem(id);
      expect(it).toMatchObject({ quantity_unit: "reps", quantity_min: 8, quantity_max: null, quantity_note: "por lado", rest_min: 45, intensity_type: "rpe", intensity_value: 8, tip: "Lento" });
      const { data: set } = await fx.db.from("plan_item_sets").select("quantity_unit, quantity_min, rest_min").eq("item_id", it.id as string).single();
      expect(set).toEqual({ quantity_unit: "failure", quantity_min: null, rest_min: 30 });
    });

    it("unidade 'até a falha' descarta quantidade enviada (normalização no servidor)", async () => {
      const id = await rpc<string>(owner.client, "save_training_plan", { p_plan: plan(null, [item(ex.supra, { quantity_unit: "failure", quantity_min: 5 })]) });
      expect(await firstItem(id)).toMatchObject({ quantity_unit: "failure", quantity_min: null, quantity_max: null });
    });

    it.each([
      ["reps fracionadas", { quantity_min: 8.5, quantity_max: null }],
      ["máx < mín", { quantity_min: 12, quantity_max: 8 }],
      ["RIR fora da faixa", { intensity_type: "rir", intensity_value: 11 }],
      ["%1RM sem valor", { intensity_type: "pct_1rm", intensity_value: null }],
      ["velocidade e cadência juntas", { speed: "fast", tempo: "3010" }],
      ["pausa máx < mín", { rest_min: 90, rest_max: 60 }],
    ])("recusa %s", async (_label, patch) => {
      await expect(rpc(owner.client, "save_training_plan", { p_plan: plan(null, [item(ex.supra, patch)]) })).rejects.toThrow();
    });
  });

  describe("substitutos", () => {
    it("até 3, visíveis; o principal, arquivado, de outra org, repetido ou 4+ são recusados", async () => {
      const ok = await rpc<string>(owner.client, "save_training_plan", { p_plan: plan(null, [item(ex.supino, { substitutes: [ex.prancha, ex.deadbug] })]) });
      const it = await firstItem(ok);
      const { data: subs } = await fx.db.from("plan_item_substitutes").select("exercise_id, position").eq("item_id", it.id as string).order("position");
      expect(subs).toEqual([{ exercise_id: ex.prancha, position: 0 }, { exercise_id: ex.deadbug, position: 1 }]);

      const archived = await rpc<string>(owner.client, "save_exercise", { p_id: null, p_data: { name: "Arquivado 2.8", muscle_groups: ["abdomen"] }, p_rules: [] });
      await owner.client.from("exercises").update({ archived_at: new Date().toISOString() }).eq("id", archived);
      for (const bad of [[ex.supino], [archived], [exB], [ex.prancha, ex.prancha], [ex.prancha, ex.deadbug, ex.supra, archived]]) {
        await expect(rpc(owner.client, "save_training_plan", { p_plan: plan(null, [item(ex.supino, { substitutes: bad })]) })).rejects.toThrow("INVALID_SUBSTITUTE");
      }
    });

    it("alertas incluem substitutos; cópia preserva substitutos e prescrição", async () => {
      await fx.db.from("students").update({ health_data_consent_at: new Date().toISOString() }).eq("id", s1);
      const id = await rpc<string>(trainer.client, "save_training_plan", {
        p_plan: plan(s1, [item(ex.supino, { substitutes: [ex.supra], quantity_unit: "reps", quantity_min: 6, intensity_type: "pct_1rm", intensity_value: 75 })]),
      });
      const alerts = await rpc<Row[]>(trainer.client, "plan_contraindication_alerts", { p_plan_id: id });
      expect(alerts).toEqual([expect.objectContaining({ exercise_id: ex.supra, substitute: true, level: "avoid" })]);

      const dup = await rpc<string>(trainer.client, "duplicate_plan", { p_plan_id: id });
      const it = await firstItem(dup);
      expect(it).toMatchObject({ quantity_min: 6, intensity_type: "pct_1rm", intensity_value: 75 });
      const { data: subs } = await fx.db.from("plan_item_substitutes").select("exercise_id").eq("item_id", it.id as string);
      expect(subs).toEqual([{ exercise_id: ex.supra }]);
    });
  });

  describe("listas de métodos/objetivos e padrões por exercício", () => {
    it("org nova já vem com os valores iniciais; staff lê, só owner escreve; outra org não vê", async () => {
      const { data: m } = await trainer.client.from("training_methods").select("name").order("position");
      expect(m!.map((r) => r.name)).toEqual(["Tradicional", "Drop-set", "Rest-pause", "Cluster", "Isométrico", "Excêntrico enfatizado", "Pré-exaustão", "Balístico", "FNP", "Alongamento ativo", "Alongamento passivo"]);
      expect((await trainer.client.from("training_objectives").select("id")).data).toHaveLength(10);
      expect((await trainer.client.from("training_methods").insert({ organization_id: org.id, name: "Do trainer" })).error).not.toBeNull();
      const { data: mine, error } = await owner.client.from("training_methods").insert({ organization_id: org.id, name: "Tempo sob tensão" }).select("id").single();
      expect(error).toBeNull();
      expect((await ownerB.client.from("training_methods").select("id").eq("id", mine!.id)).data).toHaveLength(0);
      expect((await trainer.client.from("training_methods").update({ archived_at: new Date().toISOString() }).eq("id", mine!.id).select("id")).data ?? []).toHaveLength(0);
      expect((await student.client.from("training_methods").select("id")).data ?? []).toHaveLength(0);

      // Item usa método/objetivo da própria org; de outra org a FK recusa.
      const { data: objB } = await fx.db.from("training_objectives").select("id").eq("organization_id", orgB.id).limit(1).single();
      await expect(rpc(owner.client, "save_training_plan", { p_plan: plan(null, [item(ex.supra, { method_id: mine!.id })]) })).resolves.toBeTruthy();
      await expect(rpc(owner.client, "save_training_plan", { p_plan: plan(null, [item(ex.supra, { objective_id: objB!.id })]) })).rejects.toThrow();
    });

    it("padrões: global somente leitura; camada da org editável conforme o autor", async () => {
      const { data: g } = await trainer.client.from("exercise_defaults").select("sets, quantity_unit, quantity_min, quantity_max").is("organization_id", null).eq("exercise_id", ex.prancha).single();
      expect(g).toEqual({ sets: 3, quantity_unit: "seconds", quantity_min: 20, quantity_max: 40 });
      expect((await trainer.client.from("exercise_defaults").insert({ organization_id: null, exercise_id: ex.supra, sets: 5 })).error).not.toBeNull();
      expect((await trainer.client.from("exercise_defaults").insert({ organization_id: org.id, exercise_id: ex.supra, sets: 4, quantity_min: 15 })).error).toBeNull();
      expect((await ownerB.client.from("exercise_defaults").select("id").eq("organization_id", org.id)).data).toHaveLength(0);
      const own = await rpc<string>(trainer.client, "save_exercise", { p_id: null, p_data: { name: "Do t1 2.8", muscle_groups: ["abdomen"] }, p_rules: [] });
      expect((await trainer2.client.from("exercise_defaults").insert({ organization_id: org.id, exercise_id: own, sets: 2 })).error).not.toBeNull();
      expect((await owner.client.from("exercise_defaults").insert({ organization_id: org.id, exercise_id: own, sets: 2 })).error).toBeNull();
      expect((await ownerB.client.from("exercise_defaults").insert({ organization_id: orgB.id, exercise_id: own, sets: 2 })).error).not.toBeNull();
    });
  });

  describe("cópia em massa", () => {
    let tpl: string;
    beforeAll(async () => {
      tpl = await rpc<string>(owner.client, "save_training_plan", { p_plan: plan(null, [item(ex.supra, { substitutes: [ex.prancha] })], { name: "Modelo massa" }) });
    });

    it("prévia por aluno: alertas, oculto e aluno inacessível", async () => {
      await fx.db.from("students").update({ health_data_consent_at: null }).eq("id", s1);
      const owners = await rpc<Row[]>(owner.client, "preview_plan_alerts_for_students", { p_source: tpl, p_students: [s1, s2, sB] });
      const by = Object.fromEntries(owners.map((r) => [r.student_id, r]));
      expect(by[s1]).toMatchObject({ hidden: true }); // owner não é responsável e o titular não confirmou
      expect(by[s2]).toMatchObject({ hidden: true }); // idem (aluno do trainer2)
      expect(by[sB]).toMatchObject({ error: "STUDENT_NOT_FOUND" });
      const t1 = await rpc<Row[]>(trainer.client, "preview_plan_alerts_for_students", { p_source: tpl, p_students: [s1] });
      expect(t1[0]).toMatchObject({ avoid: 1, hidden: false });
    });

    it("um aluno inválido não impede os outros; ativa ou deixa em rascunho", async () => {
      const res = await rpc<Row[]>(trainer.client, "apply_plan_to_students", {
        p_source: tpl, p_students: [s1, s2, sB], p_starts_on: spDateDaysAgo(1), p_ends_on: spDateDaysAgo(-30), p_no_end: false, p_activate: true,
      });
      const by = Object.fromEntries(res.map((r) => [r.student_id, r]));
      expect(by[s1]).toMatchObject({ status: "active", error: null });
      expect(by[s2]).toMatchObject({ plan_id: null }); // aluno do trainer2
      expect(String(by[s2].error)).toMatch(/STUDENT_NOT_FOUND|FORBIDDEN/);
      expect(String(by[sB].error)).toMatch(/STUDENT_NOT_FOUND|FORBIDDEN/);
      const { data: copies } = await fx.db.from("training_plans").select("student_id").eq("source_plan_id", tpl);
      expect(copies!.map((c) => c.student_id)).toEqual([s1]);
      const it = await firstItem(by[s1].plan_id as string);
      expect((await fx.db.from("plan_item_substitutes").select("exercise_id").eq("item_id", it.id as string)).data).toHaveLength(1);

      const drafts = await rpc<Row[]>(owner.client, "apply_plan_to_students", {
        p_source: tpl, p_students: [s2, s3], p_starts_on: null, p_ends_on: null, p_no_end: false, p_activate: false,
      });
      expect(drafts.every((r) => r.status === "draft")).toBe(true);
      await expect(
        rpc(owner.client, "apply_plan_to_students", { p_source: tpl, p_students: [s2], p_starts_on: null, p_ends_on: null, p_no_end: false, p_activate: true }),
      ).rejects.toThrow("PLAN_DATES_REQUIRED");
    });
  });

  describe("aluno e anônimo recusados", () => {
    it.each([
      ["apply_plan_to_students", () => ({ p_source: s1, p_students: [s1], p_starts_on: null, p_ends_on: null, p_no_end: false, p_activate: false })],
      ["preview_plan_alerts_for_students", () => ({ p_source: s1, p_students: [s1] })],
      ["get_plan_header", () => ({ p_plan_id: s1 })],
      ["save_training_plan", () => ({ p_plan: plan(s1, []) })],
    ])("%s", async (fn, args) => {
      await expect(rpc(student.client, fn, args())).rejects.toThrow(/FORBIDDEN|NOT_FOUND/);
      expect((await anon().rpc(fn, args())).error).not.toBeNull();
    });

    it("tabelas novas invisíveis", async () => {
      for (const table of ["training_methods", "training_objectives", "exercise_defaults", "plan_item_substitutes"]) {
        expect((await student.client.from(table).select("*").limit(1)).data ?? []).toHaveLength(0);
        expect((await anon().from(table).select("*").limit(1)).data ?? []).toHaveLength(0);
      }
    });
  });
});
