import { describe, expect, it } from "vitest";
import {
  completedComparison,
  completedToday,
  type EngagementStats,
  percent,
  satisfaction,
  topStudents,
  type TrainingStats,
  trainingMetrics,
  variation,
  weekPoints,
} from "@/features/dashboard/stats";

const training = (over: Partial<TrainingStats> = {}): TrainingStats => ({
  today: "2026-10-21", // quarta
  registered_30d: 12,
  registered_prev_30d: 10,
  completed_today_count: 1,
  completed_same_weekday_last_week: 2,
  completed_today: [
    { session_id: "s1", student_id: "a", student_name: "Camila Freitas", workout_label: "A", workout_name: "Peito", finished_at: "2026-10-21T02:30:00Z" },
  ],
  week: [6, 0, 1, 2, 3, 4, 5].map((i) => ({ day_index: i, current: i <= 2 ? i : null, one_week_ago: 1, two_weeks_ago: 0 })),
  week_total: 3,
  last_week_total_to_date: 3,
  top5: [{ student_id: "a", student_name: "Camila Freitas", completed_30d: 4, last_completed_at: "2026-10-21T02:30:00Z" }],
  ...over,
});

const engagement = (over: Partial<EngagementStats> = {}): EngagementStats => ({
  today: "2026-10-21",
  engagement: { active_students: 20, trained_7d: 13 },
  retention: { base_31_60: 8, retained_0_30: 6 },
  history_since: "2026-08-01",
  satisfaction: { ratings: 12, average: 4.58, distribution: [1, 2, 3, 4, 5].map((stars) => ({ stars, count: stars === 5 ? 8 : stars === 4 ? 3 : stars === 3 ? 1 : 0 })) },
  ...over,
});

describe("variação e percentual sem inventar base", () => {
  it("variação contra o período anterior", () => {
    expect(variation(12, 10)).toBe("+20%");
    expect(variation(9, 10)).toBe("−10%");
    expect(variation(10, 10)).toBe("0%");
    expect(variation(5, 0)).toBeNull();
  });
  it("percentual com denominador zero é nulo, não 0%", () => {
    expect(percent(13, 20)).toBe(65);
    expect(percent(0, 0)).toBeNull();
  });
});

describe("tiles da visão geral", () => {
  it("com dados: treinos, engajamento e retenção com fórmula", () => {
    const m = trainingMetrics(training(), engagement());
    expect(m.map((x) => [x.id, x.value])).toEqual([["treinos-30", "12"], ["engajamento", "65%"], ["retencao", "75%"]]);
    expect(m[0].hint).toBe("nos últimos 30 dias · +20% vs. 30 dias anteriores");
    expect(m[1].hint).toBe("13 de 20 treinaram em 7 dias");
    expect(m[2].hint).toBe("6 de 8 voltaram a treinar");
    expect(m.every((x) => x.formula)).toBe(true);
  });
  it("sem período anterior, sem variação; sem alunos ativos, '—'", () => {
    const m = trainingMetrics(training({ registered_prev_30d: 0 }), engagement({ engagement: { active_students: 0, trained_7d: 0 } }));
    expect(m[0].hint).toBe("nos últimos 30 dias");
    expect(m[1]).toMatchObject({ value: "—", hint: "nenhum aluno ativo" });
  });
  it("retenção sem base: dados insuficientes e a data em que passa a existir", () => {
    const r = trainingMetrics(null, engagement({ retention: { base_31_60: 0, retained_0_30: 0 }, history_since: "2026-10-10" }));
    expect(r[1]).toMatchObject({ id: "retencao", value: "—", hint: "dados insuficientes até 09/11" });
    const none = trainingMetrics(null, engagement({ retention: { base_31_60: 0, retained_0_30: 0 }, history_since: null }));
    expect(none[1].hint).toBe("dados insuficientes");
  });
  it("sem as RPCs (migration ainda não aplicada), nenhum tile de sessão", () => {
    expect(trainingMetrics(null, null)).toEqual([]);
  });
});

describe("cards de treino", () => {
  it("concluídos hoje: divisão e hora em São Paulo (23h30 de Brasília)", () => {
    expect(completedToday(training())).toEqual([{ id: "s1", studentName: "Camila Freitas", workoutName: "Treino A · Peito", time: "23:30" }]);
  });
  it("comparação com o mesmo dia da semana passada, com o gênero certo", () => {
    expect(completedComparison(training())).toBe("2 na quarta passada");
    expect(completedComparison(training({ today: "2026-10-24" }))).toBe("2 no sábado passado");
    expect(completedComparison(training({ today: "2026-10-26" }))).toBe("2 na segunda passada");
  });
  it("semana começa na segunda, dias futuros sem valor", () => {
    const w = weekPoints(training());
    expect(w.map((p) => p.day)).toEqual(["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]);
    expect(w.map((p) => p.current)).toEqual([0, 1, 2, null, null, null, null]);
  });
  it("top 5", () => {
    expect(topStudents(training())).toEqual([{ id: "a", name: "Camila Freitas", workouts: 4 }]);
  });
});

describe("satisfação", () => {
  it("média com a quantidade de notas", () => {
    const s = satisfaction(engagement());
    expect(s?.headline).toBe("4,6 · 12 notas");
    expect(s?.distribution.map((d) => d.stars)).toEqual([5, 4, 3, 2, 1]);
  });
  it("uma nota só: singular", () => {
    expect(satisfaction(engagement({ satisfaction: { ratings: 1, average: 5, distribution: [] } }))?.headline).toBe("5,0 · 1 nota");
  });
  it("sem nenhuma nota (ou sem a RPC), o card some", () => {
    expect(satisfaction(engagement({ satisfaction: { ratings: 0, average: null, distribution: [] } }))).toBeNull();
    expect(satisfaction(null)).toBeNull();
  });
});
