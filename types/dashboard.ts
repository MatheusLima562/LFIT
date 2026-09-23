import type { LucideIcon } from "lucide-react";

/* ----------------------------------------------------------------------------
 * Entidades (formato próximo ao que a API deve devolver)
 * -------------------------------------------------------------------------- */

export type StudentStatus = "active" | "inactive";

export interface Student {
  id: string;
  name: string;
  email: string;
  status: StudentStatus;
  /** Fim do programa de treino atual. `null` = aluno sem treino. */
  workoutPlanEndsAt: string | null;
  /** Último check-in/treino registrado. */
  lastCheckInAt: string | null;
  /** Próxima avaliação física. `null` = nunca avaliado. */
  assessmentDueAt: string | null;
  /** Fim do acesso ao app. `null` = acesso sem data de expiração. */
  accessEndsAt: string | null;
  subscribedAt: string;
  workoutsLast30Days: number;
}

export interface Review {
  id: string;
  studentId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string;
  createdAt: string;
}

export interface CompletedWorkout {
  id: string;
  studentId: string;
  workoutName: string;
  completedAt: string;
}

export interface Plan {
  name: string;
  studentLimit: number;
}

export interface SalesSummary {
  /** Valores em centavos. */
  receivable: number;
  available: number;
  transactions: number;
}

export interface WeeklyWorkoutsPoint {
  day: string;
  current: number | null;
  oneWeekAgo: number;
  twoWeeksAgo: number;
}

export interface CurrentUser {
  firstName: string;
  fullName: string;
  role: string;
}

export interface Banner {
  id: string;
  title: string;
  description: string;
  cta: string;
  href: string;
}

/* ----------------------------------------------------------------------------
 * Modelos de visualização (derivados em lib/dashboard.ts)
 * -------------------------------------------------------------------------- */

export interface StudentRef {
  id: string;
  name: string;
  /** Texto auxiliar, ex.: "vence em 3 dias". */
  meta?: string;
}

export interface StatTab {
  id: string;
  label: string;
  items: StudentRef[];
  emptyMessage: string;
  tone?: "neutral" | "warning" | "danger";
}

export interface SatisfactionSummary {
  average: number;
  total: number;
  distribution: { stars: number; count: number }[];
  latest: (Review & { studentName: string }) | null;
}

export interface PlanUsage {
  planName: string;
  used: number;
  limit: number;
  remaining: number;
  inactive: number;
}

export interface TopStudent {
  id: string;
  name: string;
  workouts: number;
}

export interface OverviewMetric {
  id: string;
  label: string;
  value: string;
  hint: string;
  tone: "brand" | "positive" | "neutral" | "violet";
}

export interface CompletedWorkoutItem {
  id: string;
  studentName: string;
  workoutName: string;
  time: string;
}

export interface DashboardSummary {
  referenceDate: string;
  metrics: OverviewMetric[];
  tracking: StatTab[];
  satisfaction: SatisfactionSummary;
  completedToday: CompletedWorkoutItem[];
  plan: PlanUsage;
  subscribers: StatTab[];
  topStudents: TopStudent[];
  assessment: StatTab[];
  expiringAccess: StudentRef[];
  weeklyWorkouts: WeeklyWorkoutsPoint[];
  sales: SalesSummary;
}

export type DashboardCardId =
  | "overview"
  | "tracking"
  | "satisfaction"
  | "completed"
  | "plan"
  | "subscribers"
  | "topStudents"
  | "assessment"
  | "expiringAccess"
  | "weeklyWorkouts"
  | "sales";

/* ----------------------------------------------------------------------------
 * Navegação e ações
 * -------------------------------------------------------------------------- */

export interface NavChild {
  label: string;
  href: string;
}

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
  children?: NavChild[];
}

export interface NavSection {
  id: string;
  title?: string;
  items: NavItem[];
}

export interface QuickActionField {
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "date" | "select";
  placeholder?: string;
  options?: string[];
  required?: boolean;
}

export interface QuickAction {
  id: string;
  label: string;
  /** Rótulo curto usado no dropdown "+ Novo". */
  menuLabel: string;
  description: string;
  icon: LucideIcon;
  submitLabel: string;
  successMessage: string;
  fields: QuickActionField[];
}

export interface SearchableStudent {
  id: string;
  name: string;
  email: string;
  status: StudentStatus;
}
