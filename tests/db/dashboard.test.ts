import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, studentData, type TestOrg, type TestUser } from "./helpers";

type Json = Record<string, unknown>;
type Training = {
  today: string;
  registered_30d: number;
  registered_prev_30d: number;
  completed_today_count: number;
  completed_same_weekday_last_week: number;
  completed_today: Json[];
  week: { day_index: number; current: number | null; one_week_ago: number; two_weeks_ago: number }[];
  week_total: number;
  last_week_total_to_date: number;
  top5: { student_id: string; student_name: string; completed_30d: number }[];
};
type Engagement = {
  engagement: { active_students: number; trained_7d: number };
  retention: { base_31_60: number; retained_0_30: number };
  history_since: string | null;
  satisfaction: { ratings: number; average: number | null; distribution: { stars: number; count: number }[] };
};

// --- Datas em São Paulo (UTC−3, sem horário de verão desde 2019) ---------------------------------------------------
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
/** Instante de um dia relativo a hoje, no relógio de Brasília. */
const spAt = (dayOffset: number, hhmm: string) => new Date(`${addDays(TODAY, dayOffset)}T${hhmm}:00-03:00`).toISOString();
const weekdayIndex = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = segunda
const MONDAY = addDays(TODAY, -weekdayIndex(TODAY));

/**
 * Início com dados reais (migrations 20261020120000/120100): contagem pelo ACESSO AO ALUNO, dias em São Paulo, só
 * números e nomes. As sessões são criadas pela secret key (as RPCs só leem as linhas).
 */
describe.runIf(dbTestsEnabled)("dashboard do Início: treinos, engajamento, retenção e satisfação", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, t1: TestUser, t2: TestUser, studentUser: TestUser, ownerB: TestUser;
  const s: Record<string, string> = {};
  const names: Record<string, string> = {};

  const session = async (
    orgId: string,
    studentId: string,
    o: { start: string; end?: string; status?: "completed" | "in_progress" | "abandoned"; rating?: number; label?: string; name?: string; feedback?: string },
  ) => {
    const status = o.status ?? (o.end ? "completed" : "in_progress");
    const { error } = await fx.db.from("workout_sessions").insert({
      organization_id: orgId, student_id: studentId, workout_label: o.label ?? "A", workout_name: o.name ?? null, snapshot: {},
      status, started_at: o.start, finished_at: status === "completed" ? o.end : null, student_rating: o.rating ?? null,
      feedback_note: o.feedback ?? null, pain_checkin: o.feedback ? "ainda_incomoda" : null,
    });
    if (error) throw error;
  };
  const training = (u: TestUser) => rpc<Training>(u.client, "get_dashboard_training_stats");
  const engagement = (u: TestUser) => rpc<Engagement>(u.client, "get_dashboard_engagement_retention");

  beforeAll(async () => {
    org = await fx.org("dash");
    orgB = await fx.org("dash-b");
    owner = await fx.user(org, "owner", "o1");
    t1 = await fx.user(org, "trainer", "t1");
    t2 = await fx.user(org, "trainer", "t2");
    studentUser = await fx.user(org, "student", "aluno");
    ownerB = await fx.user(orgB, "owner", "ob");

    const create = async (key: string, client: TestUser, first: string, trainer: string | null) => {
      const row = await rpc<{ id: string }>(client.client, "create_student", { p_data: studentData({ first_name: first, last_name: "Painel" }) });
      s[key] = row.id;
      names[key] = `${first} Painel`;
      await fx.db.from("students").update({ trainer_id: trainer }).eq("id", row.id);
    };
    await create("s1", owner, "Ana", t1.id);
    await create("s2", owner, "Bruno", t1.id);
    await create("s3", owner, "Carla", t2.id);
    await create("s4", owner, "Davi", null); // sem professor: só o owner acessa
    await create("s5", owner, "Elisa", t1.id); // inativa
    await create("s6", owner, "Fabio", t1.id); // excluída
    await create("sB", ownerB, "Gil", null); // outra organização
    await fx.db.from("students").update({ status: "inactive" }).eq("id", s.s5);
    await fx.db.from("students").update({ user_id: studentUser.id }).eq("id", s.s1);

    // s1 — bordas de fuso: ontem às 23h de Brasília (02h UTC de hoje: em UTC seria "hoje") e hoje às 00h30 (03h30 UTC).
    // Comentário e dor fictícios: não podem aparecer em nenhuma saída.
    await session(org.id, s.s1, { start: spAt(0, "00:10"), end: spAt(0, "00:30"), rating: 5, label: "A", name: "Peito", feedback: "dor no joelho (fictício)" });
    await session(org.id, s.s1, { start: spAt(-1, "22:00"), end: spAt(-1, "23:00") });
    await session(org.id, s.s1, { start: spAt(-2, "09:00"), status: "abandoned" });
    await session(org.id, s.s1, { start: spAt(-7, "10:00"), end: spAt(-7, "11:00"), rating: 4 });
    await session(org.id, s.s1, { start: spAt(-40, "10:00"), end: spAt(-40, "11:00"), rating: 1 }); // nota fora dos 30 dias
    // s2 — treinou há 45 dias e não voltou.
    await session(org.id, s.s2, { start: spAt(-45, "10:00"), end: spAt(-45, "11:00") });
    // s3 (do t2) — treinou há 40 dias e voltou.
    await session(org.id, s.s3, { start: spAt(0, "08:00"), end: spAt(0, "09:00"), rating: 3, label: "B" });
    await session(org.id, s.s3, { start: spAt(-3, "10:00"), end: spAt(-3, "11:00") });
    await session(org.id, s.s3, { start: spAt(-40, "10:00"), end: spAt(-40, "11:00") });
    // s4 (só o owner) e s5 (inativa).
    await session(org.id, s.s4, { start: spAt(-1, "10:00"), end: spAt(-1, "11:00") });
    await session(org.id, s.s5, { start: spAt(-1, "07:00"), end: spAt(-1, "08:00") });
    // s6 excluída e sB de outra organização: nunca contam.
    await session(org.id, s.s6, { start: spAt(0, "07:00"), end: spAt(0, "07:30") });
    await session(orgB.id, s.sB, { start: spAt(0, "07:00"), end: spAt(0, "07:30"), rating: 2 });
    await fx.db.from("students").update({ deleted_at: new Date().toISOString() }).eq("id", s.s6);
  });
  afterAll(() => fx.cleanup());

  it("owner: organização inteira, inclusive aluno de professor cuja saúde ele não vê", async () => {
    expect(await rpc(owner.client, "can_view_student_health", { p_student_id: s.s1 })).toBe(false);
    const t = await training(owner);
    expect(t.today).toBe(TODAY);
    expect(t.completed_today_count).toBe(2); // s1 às 00h30 e s3 às 9h; o de ontem às 23h NÃO é de hoje; s6 excluída
    expect(t.completed_today.map((c) => c.student_name).sort()).toEqual([names.s1, names.s3].sort());
    expect(t.completed_same_weekday_last_week).toBe(1);
    expect(t.registered_30d).toBe(8);
    expect(t.registered_prev_30d).toBe(3);
    expect(t.top5.map((x) => [x.student_name, x.completed_30d])).toEqual([
      [names.s1, 3],
      [names.s3, 2],
      [names.s4, 1], // empate com s5: o concluído mais recente (11h × 8h) vem primeiro
      [names.s5, 1],
    ]);
  });

  it("semana de segunda a domingo em São Paulo: o treino das 23h de Brasília fica no dia certo", async () => {
    const t = await training(owner);
    // Concluídos (dia em SP) nas últimas semanas: s1 hoje, ontem (às 23h) e -7; s3 hoje e -3; s4 -1; s5 -1.
    const days = [0, -1, -7, 0, -3, -1, -1].map((offset) => addDays(TODAY, offset));
    const expected = [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const count = (from: string) => days.filter((d) => d === addDays(from, i)).length;
      return {
        day_index: i,
        current: addDays(MONDAY, i) <= TODAY ? count(MONDAY) : null,
        one_week_ago: count(addDays(MONDAY, -7)),
        two_weeks_ago: count(addDays(MONDAY, -14)),
      };
    });
    expect(t.week).toEqual(expected);
    expect(t.week_total).toBe(days.filter((d) => d >= MONDAY && d <= TODAY).length);
    expect(t.last_week_total_to_date).toBe(days.filter((d) => d >= addDays(MONDAY, -7) && d <= addDays(TODAY, -7)).length);
  });

  it("professor vê só os seus alunos", async () => {
    const a = await training(t1);
    expect(a.completed_today_count).toBe(1);
    expect(a.completed_today.map((c) => c.student_name)).toEqual([names.s1]);
    expect(a.registered_30d).toBe(5); // s1 (4) + s5 (1)
    expect(a.top5.map((x) => x.student_name)).toEqual([names.s1, names.s5]);
    const b = await training(t2);
    expect(b.completed_today.map((c) => c.student_name)).toEqual([names.s3]);
    expect(b.top5.map((x) => x.student_name)).toEqual([names.s3]);
    const e1 = await engagement(t1);
    expect(e1.engagement).toEqual({ active_students: 2, trained_7d: 1 }); // s1 e s2 ativos; s5 inativa fora
    expect(e1.retention).toEqual({ base_31_60: 2, retained_0_30: 1 });
    expect(e1.satisfaction).toMatchObject({ ratings: 2, average: 4.5 });
  });

  it("engajamento, retenção e satisfação do owner", async () => {
    const e = await engagement(owner);
    expect(e.engagement).toEqual({ active_students: 4, trained_7d: 3 }); // s1, s3, s4 treinaram; s2 não; s5 inativa
    expect(e.retention).toEqual({ base_31_60: 3, retained_0_30: 2 }); // s1 e s3 voltaram; s2 não
    expect(e.history_since).toBe(addDays(TODAY, -45));
    expect(e.satisfaction.ratings).toBe(3); // 5, 4 e 3 — a nota 1 (há 40 dias) e a da outra organização ficam fora
    expect(Number(e.satisfaction.average)).toBe(4);
    expect(e.satisfaction.distribution).toEqual([5, 4, 3, 2, 1].map((stars) => ({ stars, count: stars >= 3 ? 1 : 0 })));
  });

  it("outra organização: só os próprios números", async () => {
    const t = await training(ownerB);
    expect(t.completed_today.map((c) => c.student_name)).toEqual([names.sB]);
    expect(t.registered_30d).toBe(1);
    const e = await engagement(ownerB);
    expect(e.satisfaction).toMatchObject({ ratings: 1, average: 2 });
    expect(e.retention).toEqual({ base_31_60: 0, retained_0_30: 0 });
  });

  it("aluno e anônimo são recusados", async () => {
    await expect(training(studentUser)).rejects.toThrow("FORBIDDEN");
    await expect(engagement(studentUser)).rejects.toThrow("FORBIDDEN");
    for (const fn of ["get_dashboard_training_stats", "get_dashboard_engagement_retention"]) {
      const { error } = await anon().rpc(fn);
      expect(error, fn).not.toBeNull();
    }
  });

  it("só contagens, datas e nomes: nada de saúde, comentário, nota individual ou id de perfil", async () => {
    const t = await training(owner);
    const e = await engagement(owner);
    expect(Object.keys(t).sort()).toEqual(
      ["completed_same_weekday_last_week", "completed_today", "completed_today_count", "last_week_total_to_date", "registered_30d", "registered_prev_30d", "today", "top5", "week", "week_total"].sort(),
    );
    expect(Object.keys(t.completed_today[0]).sort()).toEqual(["finished_at", "session_id", "student_id", "student_name", "workout_label", "workout_name"].sort());
    expect(Object.keys(t.top5[0]).sort()).toEqual(["completed_30d", "last_completed_at", "student_id", "student_name"].sort());
    expect(Object.keys(e).sort()).toEqual(["engagement", "history_since", "retention", "satisfaction", "today"].sort());
    const json = JSON.stringify([t, e]);
    for (const leak of ["joelho", "ainda_incomoda", "feedback", "pain", "student_rating", "coach_reply", t1.id, owner.id]) {
      expect(json, leak).not.toContain(leak);
    }
    // Nenhum id de aluno na saída de engajamento/satisfação (só agregados).
    for (const id of Object.values(s)) expect(JSON.stringify(e)).not.toContain(id);
  });
});
