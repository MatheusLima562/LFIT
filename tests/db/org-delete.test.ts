import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbTestsEnabled, Fixture, type TestOrg } from "./helpers";

/**
 * Migration 20261124160000: apagar uma organização com exercício PRÓPRIO usado em treino (item e substituto) funciona
 * — antes a FK RESTRICT barrava a cascata conforme a ordem e a limpeza dos testes deixava organizações para trás.
 * A proteção continua: um exercício em uso não pode ser apagado sozinho.
 */
describe.runIf(dbTestsEnabled)("apagar organização com exercício próprio em uso", () => {
  const fx = new Fixture();
  let org: TestOrg;
  let exerciseId: string, itemId: string;

  beforeAll(async () => {
    org = await fx.org("orgdel");
    const { data: ex, error } = await fx.db.from("exercises").insert({ organization_id: org.id, name: `Exercício próprio ${Date.now()}` }).select("id").single();
    if (error) throw error;
    exerciseId = ex.id;
    const { data: p } = await fx.db.from("training_plans").insert({ organization_id: org.id, name: "Modelo", status: "draft" }).select("id").single();
    const w = (await fx.db.from("plan_workouts").insert({ organization_id: org.id, plan_id: p!.id, label: "A", position: 0 }).select("id").single()).data!.id;
    itemId = (await fx.db.from("plan_workout_items").insert({ organization_id: org.id, workout_id: w, exercise_id: exerciseId, position: 0, sets: 3, quantity_unit: "reps", quantity_min: 10 }).select("id").single()).data!.id;
    const { error: subErr } = await fx.db.from("plan_item_substitutes").insert({ organization_id: org.id, item_id: itemId, exercise_id: exerciseId, position: 0 });
    if (subErr) throw subErr;
  });
  afterAll(() => fx.cleanup());

  it("exercício em uso continua protegido (não sai sozinho)", async () => {
    const { error } = await fx.db.from("exercises").delete().eq("id", exerciseId);
    expect(error?.code).toBe("23503");
    expect((await fx.db.from("exercises").select("id").eq("id", exerciseId)).data).toHaveLength(1);
  });

  it("a organização inteira é apagada (cascata não depende da ordem)", async () => {
    const { error } = await fx.db.from("organizations").delete().eq("id", org.id);
    expect(error).toBeNull();
    expect((await fx.db.from("organizations").select("id").eq("id", org.id)).data).toHaveLength(0);
    expect((await fx.db.from("plan_workout_items").select("id").eq("id", itemId)).data).toHaveLength(0);
    expect((await fx.db.from("exercises").select("id").eq("id", exerciseId)).data).toHaveLength(0);
  });
});
