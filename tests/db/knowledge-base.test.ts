import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, studentData, type TestOrg, type TestUser } from "./helpers";

type Row = Record<string, unknown>;

const NEW_KEYS = [
  "hernia_lombar_flexao",
  "dor_lombar_flexao",
  "estenose_lombar_extensao",
  "espondilolistese_extensao",
  "dor_lombar_extensao",
  "ombro_manguito",
  "joelho_patelofemoral",
  "joelho_artrose",
];

describe.runIf(dbTestsEnabled)("Etapa 2.10 (Fase B): condições, regras globais aprovadas e exercícios novos", () => {
  const fx = new Fixture();
  let org: TestOrg;
  let owner: TestUser, trainer: TestUser, trainer2: TestUser, student: TestUser;
  let s1: string;
  const cond: Record<string, string> = {};

  const globalEx = async (name: string) =>
    (await fx.db.from("exercises").select("id").is("organization_id", null).eq("name", name).single()).data!.id as string;

  beforeAll(async () => {
    org = await fx.org("kb");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer", "t1");
    trainer2 = await fx.user(org, "trainer", "t2");
    student = await fx.user(org, "student");
    s1 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    await fx.db.from("students").update({ trainer_id: trainer.id }).eq("id", s1);
    const { data } = await fx.db.from("health_conditions").select("id, key").not("key", "is", null);
    for (const c of data ?? []) cond[c.key as string] = c.id as string;
  });
  afterAll(() => fx.cleanup());

  it("8 condições globais novas, cada uma sob a sua região, com sinônimos", async () => {
    const { data } = await fx.db
      .from("health_conditions")
      .select("key, name, parent_id, search_terms, organization_id")
      .in("key", NEW_KEYS);
    expect(data).toHaveLength(8);
    const region = (key: string) => (data ?? []).find((c) => c.key === key)!.parent_id;
    expect(region("hernia_lombar_flexao")).toBe(cond.lombar);
    expect(region("dor_lombar_extensao")).toBe(cond.lombar);
    expect(region("ombro_manguito")).toBe(cond.ombro);
    expect(region("joelho_artrose")).toBe(cond.joelho);
    const pfp = (data ?? []).find((c) => c.key === "joelho_patelofemoral")!;
    expect(pfp.name).toBe("Dor patelofemoral");
    expect(pfp.search_terms).toContain("condromalácia");
    // Regiões seguem sem pai.
    const { data: regions } = await fx.db.from("health_conditions").select("parent_id").in("key", ["lombar", "cervical", "ombro", "joelho"]);
    expect((regions ?? []).every((r) => r.parent_id === null)).toBe(true);
  });

  it("exatamente as 19 regras aprovadas, todas cautela; sem regra nas condições sem alerta", async () => {
    const { data } = await fx.db
      .from("exercise_contraindications")
      .select("level, note, condition:health_conditions!inner(key), exercise:exercises!inner(name)")
      .is("organization_id", null);
    const rows = (data ?? []) as unknown as { level: string; note: string; condition: { key: string }; exercise: { name: string } }[];
    expect(rows).toHaveLength(19);
    expect(rows.every((r) => r.level === "caution" && r.note.length > 0)).toBe(true);
    const count = (key: string) => rows.filter((r) => r.condition.key === key).length;
    expect(count("hernia_lombar_flexao")).toBe(6);
    expect(count("dor_lombar_flexao")).toBe(6);
    expect(count("estenose_lombar_extensao")).toBe(2);
    expect(count("espondilolistese_extensao")).toBe(2);
    expect(count("dor_lombar_extensao")).toBe(2);
    expect(rows.filter((r) => r.condition.key === "ombro_manguito").map((r) => r.exercise.name)).toEqual(["Tríceps no banco"]);
    for (const key of ["lombar", "cervical", "joelho_patelofemoral", "joelho_artrose"]) expect(count(key)).toBe(0);
  });

  it("2 exercícios globais novos com padrões na camada global", async () => {
    const { data } = await fx.db
      .from("exercise_defaults")
      .select("sets, quantity_unit, quantity_min, quantity_max, rest_min, rest_max, exercise:exercises!inner(name, organization_id)")
      .is("organization_id", null)
      .in("exercise.name", ["Rotação externa com elástico/polia", "Elevação no plano da escápula"]);
    const byName = Object.fromEntries(((data ?? []) as unknown as (Row & { exercise: { name: string } })[]).map((d) => [d.exercise.name, d]));
    expect(byName["Rotação externa com elástico/polia"]).toMatchObject({ sets: 3, quantity_unit: "reps", quantity_min: 12, quantity_max: 15, rest_min: 45, rest_max: 60 });
    expect(byName["Elevação no plano da escápula"]).toMatchObject({ sets: 3, quantity_unit: "reps", quantity_min: 10, quantity_max: 12, rest_min: 45, rest_max: 60 });
  });

  it("org não altera condição nem regra global", async () => {
    const upd = await owner.client.from("health_conditions").update({ name: "X", search_terms: ["y"] }).eq("key", "joelho_artrose").select("id");
    expect(upd.data ?? []).toHaveLength(0);
    const rule = await owner.client
      .from("exercise_contraindications")
      .update({ level: "avoid" })
      .is("organization_id", null)
      .eq("condition_id", cond.ombro_manguito)
      .select("id");
    expect(rule.data ?? []).toHaveLength(0);
    const { data } = await fx.db.from("exercise_contraindications").select("level").is("organization_id", null).eq("condition_id", cond.ombro_manguito);
    expect(data).toEqual([{ level: "caution" }]);
  });

  it("região da condição própria: global ou da org, um nível só; sinônimos validados", async () => {
    const own = await owner.client
      .from("health_conditions")
      .insert({ organization_id: org.id, name: "Protrusão L5 (kb)", parent_id: cond.lombar, search_terms: ["protrusão"] })
      .select("id")
      .single();
    expect(own.error).toBeNull();
    // Condição (que já tem pai) não pode ser região de outra.
    const nested = await owner.client
      .from("health_conditions")
      .insert({ organization_id: org.id, name: "Subtipo (kb)", parent_id: cond.hernia_lombar_flexao })
      .select("id");
    expect(nested.error?.message).toBe("INVALID_CONDITION");
    // Uma região que já tem condições não pode virar filha.
    const parentOwn = await owner.client.from("health_conditions").insert({ organization_id: org.id, name: "Região própria (kb)" }).select("id").single();
    await owner.client.from("health_conditions").insert({ organization_id: org.id, name: "Filha (kb)", parent_id: parentOwn.data!.id });
    const flip = await owner.client.from("health_conditions").update({ parent_id: cond.lombar }).eq("id", parentOwn.data!.id).select("id");
    expect(flip.error?.message).toBe("INVALID_CONDITION");
    const bad = await owner.client.from("health_conditions").insert({ organization_id: org.id, name: "Sinônimo ruim (kb)", search_terms: ["x"] }).select("id");
    expect(bad.error).not.toBeNull();
  });

  it("aluno em grupo ligado à hérnia: alerta completo para o responsável, restrito para o professor do plano", async () => {
    const group = await fx.group(org, "Hérnia (kb)");
    await fx.db.from("special_group_conditions").insert({ organization_id: org.id, group_id: group, condition_id: cond.hernia_lombar_flexao });
    await fx.db.from("student_groups").insert({ organization_id: org.id, student_id: s1, group_id: group });
    const supra = await globalEx("Abdominal supra");
    const planId = await rpc<string>(trainer.client, "save_training_plan", {
      p_plan: {
        student_id: s1,
        name: "Plano kb",
        trainer_id: trainer2.id,
        workouts: [{ label: "A", items: [{ exercise_id: supra, sets: 3, quantity_unit: "reps", quantity_min: 10, quantity_max: 12 }] }],
      },
    });
    const full = await rpc<Row[]>(trainer.client, "plan_contraindication_alerts", { p_plan_id: planId });
    expect(full).toEqual([
      expect.objectContaining({
        level: "caution",
        condition_name: "Hérnia discal lombar (intolerância à flexão)",
        note: "Isometrias: dead bug, prancha, Pallof press.",
        group_name: "Hérnia (kb)",
        restricted: false,
      }),
    ]);
    const restricted = await rpc<Row[]>(trainer2.client, "plan_contraindication_alerts", { p_plan_id: planId });
    expect(restricted).toEqual([expect.objectContaining({ level: "caution", condition_name: null, note: null, group_name: null, restricted: true })]);
  });

  it("aluno e anônimo não leem regras nem condições", async () => {
    for (const table of ["health_conditions", "exercise_contraindications"]) {
      expect((await student.client.from(table).select("id").limit(1)).data ?? []).toHaveLength(0);
      expect((await anon().from(table).select("id").limit(1)).data ?? []).toHaveLength(0);
    }
  });
});
