import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, type TestOrg, type TestUser } from "./helpers";

describe.runIf(dbTestsEnabled)("Fase 2.2: biblioteca de exercícios (view + RPCs invoker)", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, trainer: TestUser, trainer2: TestUser, student: TestUser, ownerB: TestUser;
  let lombar: string, joelho: string, supra: string;

  beforeAll(async () => {
    org = await fx.org("exlib");
    orgB = await fx.org("exlib-b");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer", "t1");
    trainer2 = await fx.user(org, "trainer", "t2");
    student = await fx.user(org, "student");
    ownerB = await fx.user(orgB, "owner");
    const { data: c } = await fx.db.from("health_conditions").select("id, key").in("key", ["lombar", "joelho"]);
    lombar = c!.find((x) => x.key === "lombar")!.id;
    joelho = c!.find((x) => x.key === "joelho")!.id;
    const { data: e } = await fx.db.from("exercises").select("id").is("organization_id", null).eq("name", "Abdominal supra").single();
    supra = e!.id;
  });
  afterAll(() => fx.cleanup());

  it("busca sem acento pela view", async () => {
    const { data } = await trainer.client.from("exercise_library").select("name, is_global").ilike("search_text", "%triceps%");
    expect(data!.map((r) => r.name)).toContain("Tríceps na polia");
    expect(data!.every((r) => r.is_global)).toBe(true);
  });

  it("aluno e anônimo não veem a view", async () => {
    expect((await student.client.from("exercise_library").select("id").limit(1)).data ?? []).toHaveLength(0);
    expect((await anon().from("exercise_library").select("id").limit(1)).data ?? []).toHaveLength(0);
  });

  it("cria exercício próprio com regras da org de forma atômica", async () => {
    const id = await rpc<string>(trainer.client, "save_exercise", {
      p_id: null,
      p_data: { name: "Remada cavalinho", muscle_groups: ["dorsais"], equipment: "Barra T" },
      p_rules: [{ condition_id: lombar, level: "caution", note: "Tronco inclinado" }],
    });
    const { data } = await fx.db.from("exercise_contraindications").select("organization_id, level, note").eq("exercise_id", id);
    expect(data).toEqual([{ organization_id: org.id, level: "caution", note: "Tronco inclinado" }]);

    // Regra inválida desfaz tudo (nada fica pela metade).
    await expect(
      rpc(trainer.client, "save_exercise", {
        p_id: null,
        p_data: { name: "Exercício quebrado", muscle_groups: [] },
        p_rules: [{ condition_id: lombar, level: "proibido" }],
      }),
    ).rejects.toThrow();
    const { count } = await fx.db.from("exercises").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("name", "Exercício quebrado");
    expect(count).toBe(0);

    // Outro trainer não edita (nem as regras) o exercício alheio.
    await expect(
      rpc(trainer2.client, "save_exercise", { p_id: id, p_data: { name: "Hack", muscle_groups: [] }, p_rules: [] }),
    ).rejects.toThrow("FORBIDDEN");
    const { count: rules } = await fx.db.from("exercise_contraindications").select("id", { count: "exact", head: true }).eq("exercise_id", id);
    expect(rules).toBe(1);
  });

  it("em exercício global só grava a camada da org; outra org não enxerga", async () => {
    await rpc(trainer.client, "save_exercise", {
      p_id: supra,
      p_data: { name: "Hack", muscle_groups: [] },
      p_rules: [{ condition_id: lombar, level: "avoid", note: "Flexão repetida" }],
    });
    const { data: ex } = await fx.db.from("exercises").select("name").eq("id", supra).single();
    expect(ex!.name).toBe("Abdominal supra");
    expect((await ownerB.client.from("exercise_contraindications").select("id").eq("exercise_id", supra)).data).toHaveLength(0);
    expect((await owner.client.from("exercise_contraindications").select("level").eq("exercise_id", supra)).data).toEqual([{ level: "avoid" }]);
  });

  it("personalizar copia o global com as regras e o esconde na listagem da org", async () => {
    const copy = await rpc<string>(trainer.client, "customize_exercise", { p_id: supra });
    const { data: c } = await fx.db.from("exercises").select("organization_id, source_exercise_id, name, created_by").eq("id", copy).single();
    expect(c).toEqual({ organization_id: org.id, source_exercise_id: supra, name: "Abdominal supra", created_by: trainer.id });
    const { data: rules } = await fx.db.from("exercise_contraindications").select("condition_id, level, note, organization_id").eq("exercise_id", copy);
    expect(rules).toEqual([{ condition_id: lombar, level: "avoid", note: "Flexão repetida", organization_id: org.id }]);

    const { data: lib } = await trainer.client.from("exercise_library").select("customized").eq("id", supra).single();
    expect(lib!.customized).toBe(true);
    const { data: libB } = await ownerB.client.from("exercise_library").select("customized").eq("id", supra).single();
    expect(libB!.customized).toBe(false);

    // Segunda personalização do mesmo nome conflita (nome único por escopo).
    await expect(rpc(trainer.client, "customize_exercise", { p_id: supra })).rejects.toThrow();
    // Só globais podem ser personalizados.
    await expect(rpc(trainer.client, "customize_exercise", { p_id: copy })).rejects.toThrow("EXERCISE_NOT_FOUND");
  });

  it("aluno é recusado nas RPCs; exercício de outra org é invisível", async () => {
    await expect(rpc(student.client, "save_exercise", { p_id: null, p_data: { name: "X", muscle_groups: [] }, p_rules: [] })).rejects.toThrow("FORBIDDEN");
    await expect(rpc(student.client, "customize_exercise", { p_id: supra })).rejects.toThrow("FORBIDDEN");
    const own = await rpc<string>(ownerB.client, "save_exercise", { p_id: null, p_data: { name: "Da org B", muscle_groups: [] }, p_rules: [] });
    await expect(
      rpc(trainer.client, "save_exercise", { p_id: own, p_data: { name: "Hack", muscle_groups: [] }, p_rules: [{ condition_id: joelho, level: "avoid" }] }),
    ).rejects.toThrow("EXERCISE_NOT_FOUND");
    const { error } = await anon().rpc("save_exercise", { p_id: null, p_data: {}, p_rules: [] });
    expect(error).not.toBeNull();
  });
});
