/**
 * Início com dados reais (docs/planos/dashboard-inicio.md): tipos das RPCs do dashboard e a montagem dos cards —
 * lógica pura, testada em tests/unit/dashboard-stats.test.ts. Nenhum número estimado: sem base, "—" ou card escondido.
 */
import { formatDecimal, formatNumber, formatTime, plural } from "@/lib/format";
import type { CompletedWorkoutItem, OverviewMetric, TopStudent, WeeklyWorkoutsPoint } from "@/types/dashboard";

/** `get_dashboard_training_stats()` */
export interface TrainingStats {
  today: string;
  registered_30d: number;
  registered_prev_30d: number;
  completed_today_count: number;
  completed_same_weekday_last_week: number;
  completed_today: {
    session_id: string;
    student_id: string;
    student_name: string;
    workout_label: string;
    workout_name: string | null;
    finished_at: string;
  }[];
  week: { day_index: number; current: number | null; one_week_ago: number; two_weeks_ago: number }[];
  week_total: number;
  last_week_total_to_date: number;
  top5: { student_id: string; student_name: string; completed_30d: number; last_completed_at: string }[];
}

/** `get_dashboard_engagement_retention()` */
export interface EngagementStats {
  today: string;
  engagement: { active_students: number; trained_7d: number };
  retention: { base_31_60: number; retained_0_30: number };
  history_since: string | null;
  satisfaction: { ratings: number; average: number | null; distribution: { stars: number; count: number }[] };
}

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const WEEKDAYS_LONG = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

/** Variação contra o período anterior: "+20%", "−10%", "0%"; com o anterior zerado, null (a tela mostra "—"). */
export function variation(current: number, previous: number): string | null {
  if (previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "0%";
  return pct > 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
}

/** Percentual inteiro; denominador zero → null (nunca "0%" sem base). */
export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/** Data ISO (AAAA-MM-DD) + n dias, em dd/mm. */
function addDaysBR(isoDay: string, n: number): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${String(dt.getUTCDate()).padStart(2, "0")}/${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Tiles da visão geral que dependem de sessões (Alunos ativos continua vindo do plano). */
export function trainingMetrics(training: TrainingStats | null, engagement: EngagementStats | null): OverviewMetric[] {
  const metrics: OverviewMetric[] = [];
  if (training) {
    const v = variation(training.registered_30d, training.registered_prev_30d);
    metrics.push({
      id: "treinos-30",
      label: "Treinos registrados",
      value: formatNumber(training.registered_30d),
      hint: v ? `nos últimos 30 dias · ${v} vs. 30 dias anteriores` : "nos últimos 30 dias",
      formula: "Treinos iniciados nos últimos 30 dias (concluídos ou não), contando os registrados pelo professor.",
      tone: "neutral",
    });
  }
  if (engagement) {
    const { active_students, trained_7d } = engagement.engagement;
    const e = percent(trained_7d, active_students);
    metrics.push({
      id: "engajamento",
      label: "Engajamento semanal",
      value: e === null ? "—" : `${e}%`,
      hint: active_students === 0 ? "nenhum aluno ativo" : `${trained_7d} de ${active_students} treinaram em 7 dias`,
      formula: "Engajamento = alunos ativos com pelo menos 1 treino registrado nos últimos 7 dias ÷ alunos ativos × 100.",
      tone: "violet",
    });
    const { base_31_60, retained_0_30 } = engagement.retention;
    const r = percent(retained_0_30, base_31_60);
    metrics.push({
      id: "retencao",
      label: "Retenção",
      value: r === null ? "—" : `${r}%`,
      hint:
        r !== null
          ? `${retained_0_30} de ${base_31_60} voltaram a treinar`
          : engagement.history_since
            ? `dados insuficientes até ${addDaysBR(engagement.history_since, 30)}`
            : "dados insuficientes",
      formula:
        "Retenção = dos alunos que concluíram treino entre 31 e 60 dias atrás, quantos concluíram de novo nos últimos 30 dias.",
      tone: "positive",
    });
  }
  return metrics;
}

/** Treinos concluídos hoje: "Treino A · Peito", hora em São Paulo. */
export function completedToday(training: TrainingStats): CompletedWorkoutItem[] {
  return training.completed_today.map((c) => ({
    id: c.session_id,
    studentName: c.student_name,
    workoutName: c.workout_name ? `Treino ${c.workout_label} · ${c.workout_name}` : `Treino ${c.workout_label}`,
    time: formatTime(c.finished_at),
  }));
}

/** Comparação do card de hoje com o mesmo dia da semana passada ("2 na terça passada"). */
export function completedComparison(training: TrainingStats): string {
  const [y, m, d] = training.today.split("-").map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 0 = segunda
  const day = WEEKDAYS_LONG[weekday];
  const prefix = weekday >= 5 ? `no ${day} passado` : `na ${day} passada`;
  return `${formatNumber(training.completed_same_weekday_last_week)} ${prefix}`;
}

export function weekPoints(training: TrainingStats): WeeklyWorkoutsPoint[] {
  return [...training.week]
    .sort((a, b) => a.day_index - b.day_index)
    .map((w) => ({ day: WEEKDAYS[w.day_index], current: w.current, oneWeekAgo: w.one_week_ago, twoWeeksAgo: w.two_weeks_ago }));
}

export function topStudents(training: TrainingStats): TopStudent[] {
  return training.top5.map((t) => ({ id: t.student_id, name: t.student_name, workouts: t.completed_30d }));
}

export interface SatisfactionView {
  average: number;
  ratings: number;
  /** "4,6 · 12 notas" */
  headline: string;
  distribution: { stars: number; count: number }[];
}

/** Satisfação: só com pelo menos uma nota nos últimos 30 dias; sem nenhuma, null (o card some). */
export function satisfaction(engagement: EngagementStats | null): SatisfactionView | null {
  const s = engagement?.satisfaction;
  if (!s || s.ratings === 0 || s.average === null) return null;
  const average = Number(s.average);
  return {
    average,
    ratings: s.ratings,
    headline: `${formatDecimal(average)} · ${plural(s.ratings, "nota")}`,
    distribution: [...s.distribution].sort((a, b) => b.stars - a.stars),
  };
}
