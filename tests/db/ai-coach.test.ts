import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, studentData, type TestOrg, type TestUser } from "./helpers";
import { CLI_TIMEOUT_MS, sqlLinked, uuidLiteral } from "./linked-sql";

/**
 * PARTE B (migration 20261124140000): comando do personal com IA — DESLIGADO por padrão, só Pro/Gold, limite por dia,
 * custo, contexto mínimo (sem aluno/saúde), texto do comando nunca gravado, finalização só pelo servidor.
 */
interface Begin { status: string; request_id?: string; remaining_today?: number; workouts?: { label: string; items: Record<string, unknown>[] }[] }

describe.runIf(dbTestsEnabled)("comando com IA do personal", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, trainer: TestUser, trainer2: TestUser, studentUser: TestUser;
  let studentId: string, noPlanStudent: string;
  const CANARY = `Canario${Date.now().toString(36)}`;

  const begin = (u: TestUser, sid = studentId, cmd = "supino +2,5 kg") => rpc<Begin>(u.client, "ai_coach_begin", { p_student_id: sid, p_command: cmd });
  const setOrg = (patch: Record<string, unknown>) => fx.db.from("organizations").update(patch).eq("id", org.id);

  beforeAll(async () => {
    org = await fx.org("coach");
    orgB = await fx.org("coach-b");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer");
    trainer2 = await fx.user(org, "trainer", "t2");
    studentUser = await fx.user(org, "student", "aluno");
    await fx.user(orgB, "owner", "ob");
    const exerciseId = (await fx.db.from("exercises").select("id").is("organization_id", null).limit(1).single()).data!.id;
    studentId = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData({ first_name: CANARY, notes: "hérnia lombar" }) })).id;
    await fx.db.from("students").update({ trainer_id: trainer.id, user_id: studentUser.id }).eq("id", studentId);
    noPlanStudent = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    const { data: p } = await fx.db.from("training_plans").insert({
      organization_id: org.id, student_id: studentId, trainer_id: trainer.id, name: `Plano da ${CANARY}`, status: "active", starts_on: "2026-11-01", ends_on: "2026-12-31",
    }).select("id").single();
    const w = (await fx.db.from("plan_workouts").insert({ organization_id: org.id, plan_id: p!.id, label: "A", position: 0 }).select("id").single()).data!.id;
    await fx.db.from("plan_workout_items").insert({
      organization_id: org.id, workout_id: w, exercise_id: exerciseId, position: 0, sets: 3, quantity_unit: "reps", quantity_min: 10,
      load_value: 40, load_unit: "kg", care_note: "cuidado com o ombro", tip: "dica interna",
    });
  });
  afterAll(() => fx.cleanup());

  it("desligado por padrão em conta nova e em TODAS as contas reais (nenhuma ligada)", async () => {
    expect((await fx.db.from("organizations").select("ai_coach_enabled").eq("id", org.id).single()).data!.ai_coach_enabled).toBe(false);
    const { count } = await fx.db.from("organizations").select("id", { count: "exact", head: true }).eq("ai_coach_enabled", true).not("name", "like", "lfit-test-%");
    expect(count).toBe(0);
    await expect(begin(owner)).rejects.toThrow("AI_DISABLED");
    const st = await rpc<{ enabled: boolean }>(owner.client, "get_ai_coach_status");
    expect(st.enabled).toBe(false);
    // Equipe não liga pela tabela.
    await owner.client.from("organizations").update({ ai_coach_enabled: true }).eq("id", org.id);
    expect((await fx.db.from("organizations").select("ai_coach_enabled").eq("id", org.id).single()).data!.ai_coach_enabled).toBe(false);
  });

  it("só plano Pro/Gold", async () => {
    await setOrg({ ai_coach_enabled: true, plan: "free" });
    await expect(begin(owner)).rejects.toThrow("AI_PLAN_REQUIRED");
    await setOrg({ plan: "pro" });
  });

  it("contexto mínimo: só exercício e prescrição — sem nome do aluno, nome do plano, saúde, cuidado ou dica", async () => {
    const r = await begin(trainer);
    expect(r.status).toBe("ok");
    expect(r.workouts![0]!.items[0]).toMatchObject({ ref: "A1", sets: 3, reps_min: 10, load: 40, load_unit: "kg", editable: true });
    const ctx = JSON.stringify(r.workouts);
    expect(ctx).not.toContain(CANARY);
    expect(ctx).not.toMatch(/hérnia|ombro|dica interna|care_note|tip|notes/);
    expect(JSON.stringify(r)).not.toContain(`Plano da ${CANARY}`);
    // O texto do comando não é gravado em lugar nenhum (só contagem/tokens/custo).
    const cols = sqlLinked("select column_name from information_schema.columns where table_schema = 'private' and table_name = 'ai_coach_requests'") as { column_name: string }[];
    expect(cols.map((c) => c.column_name).sort()).toEqual(["actor_id", "cost_usd_micros", "created_at", "day", "id", "input_tokens", "organization_id", "output_tokens", "status", "student_id"]);
  }, CLI_TIMEOUT_MS);

  it("permissões: aluno, professor sem acesso, outra conta e anônimo", async () => {
    await expect(begin(studentUser)).rejects.toThrow("FORBIDDEN");
    await expect(begin(trainer2)).rejects.toThrow("STUDENT_NOT_FOUND");
    expect((await anon().rpc("ai_coach_begin", { p_student_id: studentId, p_command: "x" })).error).not.toBeNull();
    await expect(begin(owner, studentId, "x".repeat(301))).rejects.toThrow("INVALID_INPUT");
    expect((await begin(owner, noPlanStudent)).status).toBe("no_plan");
  });

  it("finalizar (tokens e custo) só pelo servidor; custo do mês só para o personal", async () => {
    const r = await begin(owner);
    const { error } = await owner.client.rpc("ai_coach_finish", { p_request_id: r.request_id, p_input_tokens: 1, p_output_tokens: 1, p_failed: false });
    expect(error).not.toBeNull();
    await rpc(fx.db, "ai_coach_finish", { p_request_id: r.request_id, p_input_tokens: 1000, p_output_tokens: 100, p_failed: false });
    await expect(rpc(fx.db, "ai_coach_finish", { p_request_id: r.request_id, p_input_tokens: 1, p_output_tokens: 1, p_failed: false })).rejects.toThrow("INVALID_INPUT");
    const st = await rpc<{ cost_month_usd_micros: number | null }>(owner.client, "get_ai_coach_status");
    expect(st.cost_month_usd_micros).toBe(6000); // 1000 × 4 + 100 × 20
    expect((await rpc<{ cost_month_usd_micros: number | null }>(trainer.client, "get_ai_coach_status")).cost_month_usd_micros).toBeNull();
  });

  it("barreira de termos de saúde (mesma lista do assistente): recusa antes do provedor e não consome o limite", async () => {
    const before = (await rpc<{ remaining_today: number }>(owner.client, "get_ai_coach_status")).remaining_today;
    await expect(begin(owner, studentId, "supino +2 kg, ela está com dor no ombro")).rejects.toThrow("AI_HEALTH_TERMS");
    await expect(begin(owner, studentId, "tira o agachamento por causa da hérnia")).rejects.toThrow("AI_HEALTH_TERMS");
    expect((await rpc<{ remaining_today: number }>(owner.client, "get_ai_coach_status")).remaining_today).toBe(before);
    // Palavra que só contém o termo (ex.: "abdutora" tem "dor" dentro) não barra.
    expect((await begin(owner, studentId, "cadeira abdutora +5 kg")).status).toBe("ok");
  });

  it("limite de comandos por dia por conta", async () => {
    const used = (sqlLinked(`select count(*)::int as n from private.ai_coach_requests where organization_id = ${uuidLiteral(org.id)} and day = private.today_br()`) as { n: number }[])[0]!.n;
    sqlLinked(`insert into private.ai_coach_requests (organization_id, day) select ${uuidLiteral(org.id)}, (now() at time zone 'America/Sao_Paulo')::date from generate_series(1, ${30 - used})`);
    const r = await begin(owner);
    expect(r).toMatchObject({ status: "limit", remaining_today: 0 });
    expect((await rpc<{ remaining_today: number }>(owner.client, "get_ai_coach_status")).remaining_today).toBe(0);
  }, CLI_TIMEOUT_MS);

  it("conta somente leitura: não começa comando", async () => {
    await setOrg({ subscription_status: "suspended", status_changed_at: new Date().toISOString() });
    try {
      await expect(begin(owner)).rejects.toThrow("ACCOUNT_READ_ONLY");
    } finally {
      await setOrg({ subscription_status: "active", ai_coach_enabled: false });
    }
  });
});
