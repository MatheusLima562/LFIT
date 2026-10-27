import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbTestsEnabled, Fixture, rpc, spDateDaysAgo, studentData, type TestOrg, type TestUser } from "./helpers";

describe.runIf(dbTestsEnabled)("Fase 2.5: filtros de treino em Meus alunos", () => {
  const fx = new Fixture();
  let org: TestOrg;
  let owner: TestUser, trainer: TestUser;
  const ids: string[] = [];

  beforeAll(async () => {
    org = await fx.org("plan-filters");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer");
    for (let i = 0; i < 4; i++) ids.push((await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id);
    await fx.db.from("students").update({ trainer_id: trainer.id }).eq("id", ids[0]);
    const { data: ex } = await fx.db.from("exercises").select("id").is("organization_id", null).limit(1).single();
    // ids[0]: vence em 3 dias · ids[1]: venceu há 2 dias · ids[2]: em dia (30 dias) · ids[3]: sem treino
    const ends = [spDateDaysAgo(-3), spDateDaysAgo(2), spDateDaysAgo(-30)];
    for (const [i, endsOn] of ends.entries()) {
      const id = await rpc<string>(owner.client, "save_training_plan", {
        p_plan: { student_id: ids[i], name: "Plano", starts_on: spDateDaysAgo(40), ends_on: endsOn, workouts: [{ label: "A", items: [{ exercise_id: ex!.id, sets: 3, reps: "10" }] }] },
      });
      await rpc(owner.client, "activate_plan", { p_plan_id: id });
    }
  });
  afterAll(() => fx.cleanup());

  it("view expõe workout_plan_ends_at", async () => {
    const { data } = await owner.client.from("students_with_status").select("id, workout_plan_ends_at").in("id", ids);
    expect(data!.filter((r) => r.workout_plan_ends_at === null).map((r) => r.id)).toEqual([ids[3]]);
  });

  it("contagens no escopo do usuário (owner: todos; trainer: só os seus)", async () => {
    const [o] = await rpc<{ expiring: number; expired: number; no_plan: number }[]>(owner.client, "student_plan_counts");
    expect([Number(o.expiring), Number(o.expired), Number(o.no_plan)]).toEqual([1, 1, 1]);
    const [t] = await rpc<{ expiring: number; expired: number; no_plan: number }[]>(trainer.client, "student_plan_counts");
    expect([Number(t.expiring), Number(t.expired), Number(t.no_plan)]).toEqual([1, 0, 0]);
  });

  it("inativos não entram nas contagens", async () => {
    await rpc(owner.client, "deactivate_student", { p_student_id: ids[3] });
    const [o] = await rpc<{ no_plan: number }[]>(owner.client, "student_plan_counts");
    expect(Number(o.no_plan)).toBe(0);
  });
});
