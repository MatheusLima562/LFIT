import {
  REFERENCE_DATE,
  completedWorkouts,
  plan,
  reviews,
  sales,
  students,
  weeklyWorkouts,
} from "@/data/dashboard";
import type {
  DashboardSummary,
  PlanUsage,
  SatisfactionSummary,
  SearchableStudent,
  StatTab,
  Student,
  StudentRef,
} from "@/types/dashboard";
import { daysBetween, formatNumber, formatTime, plural } from "@/lib/format";

const SOON_DAYS = 7;
const ASSESSMENT_SOON_DAYS = 30;
const ABSENT_AFTER_DAYS = 14;

const today = REFERENCE_DATE;
const daysUntil = (iso: string) => daysBetween(today, iso);

function toRef(student: Student, meta?: string): StudentRef {
  return { id: student.id, name: student.name, meta };
}

function dueMeta(iso: string) {
  const days = daysUntil(iso);
  if (days === 0) return "vence hoje";
  return days > 0 ? `vence em ${plural(days, "dia")}` : `venceu há ${plural(-days, "dia")}`;
}

function getTracking(active: Student[]): StatTab[] {
  const withPlan = active.filter((s) => s.workoutPlanEndsAt !== null);
  return [
    {
      id: "a-vencer",
      label: "A vencer",
      tone: "warning",
      emptyMessage: "Nenhum aluno com treino próximo do vencimento.",
      items: withPlan
        .filter((s) => {
          const d = daysUntil(s.workoutPlanEndsAt!);
          return d >= 0 && d <= SOON_DAYS;
        })
        .map((s) => toRef(s, dueMeta(s.workoutPlanEndsAt!))),
    },
    {
      id: "vencidos",
      label: "Vencidos",
      tone: "danger",
      emptyMessage: "Nenhum aluno com treino vencido.",
      items: withPlan
        .filter((s) => daysUntil(s.workoutPlanEndsAt!) < 0)
        .map((s) => toRef(s, dueMeta(s.workoutPlanEndsAt!))),
    },
    {
      id: "sem-treino",
      label: "Sem treino",
      emptyMessage: "Todos os alunos ativos têm um treino.",
      items: active.filter((s) => s.workoutPlanEndsAt === null).map((s) => toRef(s, "sem programa ativo")),
    },
    {
      id: "ausentes",
      label: "Ausentes",
      emptyMessage: `Nenhum aluno ausente há mais de ${ABSENT_AFTER_DAYS} dias.`,
      items: active
        .filter((s) => s.lastCheckInAt !== null && -daysUntil(s.lastCheckInAt) > ABSENT_AFTER_DAYS)
        .map((s) => toRef(s, `sem treinar há ${plural(-daysUntil(s.lastCheckInAt!), "dia")}`)),
    },
  ];
}

function getAssessment(active: Student[]): StatTab[] {
  const withDate = active.filter((s) => s.assessmentDueAt !== null);
  return [
    {
      id: "vencidas",
      label: "Vencidas",
      tone: "danger",
      emptyMessage: "Nenhuma avaliação vencida.",
      items: withDate
        .filter((s) => daysUntil(s.assessmentDueAt!) < 0)
        .map((s) => toRef(s, dueMeta(s.assessmentDueAt!))),
    },
    {
      id: "a-vencer",
      label: "A vencer",
      tone: "warning",
      emptyMessage: "Nenhuma avaliação vence nos próximos 30 dias.",
      items: withDate
        .filter((s) => {
          const d = daysUntil(s.assessmentDueAt!);
          return d >= 0 && d <= ASSESSMENT_SOON_DAYS;
        })
        .map((s) => toRef(s, dueMeta(s.assessmentDueAt!))),
    },
    {
      id: "sem-avaliacao",
      label: "Sem avaliação",
      emptyMessage: "Todos os alunos já foram avaliados.",
      items: active.filter((s) => s.assessmentDueAt === null).map((s) => toRef(s, "nunca avaliado")),
    },
  ];
}

function getSubscribers(active: Student[]): StatTab[] {
  const since = (days: number) =>
    active
      .filter((s) => {
        const age = -daysUntil(s.subscribedAt);
        return age >= 0 && age < days;
      })
      .map((s) => toRef(s, `assinou há ${plural(-daysUntil(s.subscribedAt), "dia")}`));

  return [
    { id: "hoje", label: "Hoje", items: since(1), emptyMessage: "Nenhum assinante novo hoje." },
    { id: "7-dias", label: "7 dias", items: since(7), emptyMessage: "Nenhum assinante novo nos últimos 7 dias." },
    { id: "30-dias", label: "30 dias", items: since(30), emptyMessage: "Nenhum assinante novo nos últimos 30 dias." },
  ];
}

function getSatisfaction(byId: Map<string, Student>): SatisfactionSummary {
  const recent = reviews.filter((r) => -daysUntil(r.createdAt) <= 30);
  const total = recent.length;
  const average = total ? recent.reduce((sum, r) => sum + r.rating, 0) / total : 0;
  const latest = [...recent].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  return {
    average,
    total,
    distribution: [5, 4, 3, 2, 1].map((stars) => ({
      stars,
      count: recent.filter((r) => r.rating === stars).length,
    })),
    latest: latest ? { ...latest, studentName: byId.get(latest.studentId)?.name ?? "Aluno" } : null,
  };
}

export function getDashboardSummary(): DashboardSummary {
  const active = students.filter((s) => s.status === "active");
  const inactive = students.length - active.length;
  const byId = new Map(students.map((s) => [s.id, s]));

  const trainedThisWeek = active.filter(
    (s) => s.lastCheckInAt !== null && -daysUntil(s.lastCheckInAt) <= 7,
  ).length;
  const workoutsLast30 = active.reduce((sum, s) => sum + s.workoutsLast30Days, 0);
  const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

  return {
    referenceDate: today,
    metrics: [
      {
        id: "ativos",
        label: "Alunos ativos",
        value: formatNumber(active.length),
        hint: `de ${plan.studentLimit} no plano ${plan.name}`,
        tone: "brand",
      },
      {
        id: "engajamento",
        label: "Engajamento semanal",
        value: `${pct(trainedThisWeek, active.length)}%`,
        hint: `${trainedThisWeek} de ${active.length} treinaram em 7 dias`,
        tone: "violet",
      },
      {
        id: "treinos-30",
        label: "Treinos registrados",
        value: formatNumber(workoutsLast30),
        hint: "nos últimos 30 dias",
        tone: "neutral",
      },
      {
        id: "retencao",
        label: "Retenção",
        value: `${pct(active.length, students.length)}%`,
        hint: plural(inactive, "aluno inativo", "alunos inativos"),
        tone: "positive",
      },
    ],
    tracking: getTracking(active),
    satisfaction: getSatisfaction(byId),
    completedToday: completedWorkouts
      .filter((w) => daysUntil(w.completedAt) === 0)
      .map((w) => ({
        id: w.id,
        studentName: byId.get(w.studentId)?.name ?? "Aluno",
        workoutName: w.workoutName,
        time: formatTime(w.completedAt),
      })),
    plan: getPlanUsage(),
    subscribers: getSubscribers(active),
    topStudents: active
      .filter((s) => s.workoutsLast30Days > 0)
      .sort((a, b) => b.workoutsLast30Days - a.workoutsLast30Days)
      .slice(0, 5)
      .map((s) => ({ id: s.id, name: s.name, workouts: s.workoutsLast30Days })),
    assessment: getAssessment(active),
    expiringAccess: active
      .filter((s) => {
        if (!s.accessEndsAt) return false;
        const d = daysUntil(s.accessEndsAt);
        return d >= 0 && d <= SOON_DAYS;
      })
      .map((s) => toRef(s, dueMeta(s.accessEndsAt!).replace("vence", "expira"))),
    weeklyWorkouts,
    sales,
  };
}

export function getPlanUsage(): PlanUsage {
  const used = students.filter((s) => s.status === "active").length;
  return {
    planName: plan.name,
    used,
    limit: plan.studentLimit,
    remaining: Math.max(plan.studentLimit - used, 0),
    inactive: students.length - used,
  };
}

/**
 * Enquanto o dashboard usa mocks (até a etapa 1.6), plano e "Alunos ativos"
 * já vêm do banco para não divergirem da sidebar.
 */
export function withRealPlan(summary: DashboardSummary, plan: PlanUsage): DashboardSummary {
  return {
    ...summary,
    plan,
    metrics: summary.metrics.map((m) =>
      m.id === "ativos"
        ? { ...m, value: formatNumber(plan.used), hint: `de ${plan.limit} no plano ${plan.planName}` }
        : m,
    ),
  };
}

export function getSearchableStudents(): SearchableStudent[] {
  return students.map(({ id, name, email, status }) => ({ id, name, email, status }));
}
