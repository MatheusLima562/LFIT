import type {
  Banner,
  CompletedWorkout,
  Plan,
  Review,
  SalesSummary,
  Student,
  WeeklyWorkoutsPoint,
} from "@/types/dashboard";

/**
 * Dados mockados do dashboard.
 *
 * Tudo o que aparece na tela é derivado destes registros em `lib/dashboard.ts`,
 * então para conectar a API basta substituir as fontes abaixo.
 */

/** Data "de hoje" fixa para manter o mock determinístico (e sem mismatch de hidratação). */
export const REFERENCE_DATE = "2026-09-23T12:00:00-03:00";

export const plan: Plan = {
  name: "Pro",
  studentLimit: 50,
};

export const banner: Banner = {
  id: "conteudos-prontos-2026-09",
  title: "Conteúdos Prontos + Limite em Dobro",
  description: "Treinos, avaliações e materiais prontos para usar — e o dobro de alunos no seu plano.",
  cta: "Clique agora",
  href: "/vendas/planos",
};

const activeStudentNames = [
  "Matheus Lima",
  "Ana Beatriz Souza",
  "Bruno Carvalho",
  "Camila Rocha",
  "Diego Martins",
  "Fernanda Alves",
  "Gabriel Nunes",
  "Helena Duarte",
  "Igor Fernandes",
  "Juliana Castro",
  "Lucas Pereira",
  "Mariana Ribeiro",
  "Pedro Henrique Silva",
  "Rafaela Gomes",
  "Thiago Moreira",
  "Vitória Mendes",
];

function toEmail(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(" ")
      .slice(0, 2)
      .join(".") + "@email.com"
  );
}

export const students: Student[] = [
  ...activeStudentNames.map<Student>((name, index) => ({
    id: `aluno-${index + 1}`,
    name,
    email: toEmail(name),
    status: "active",
    workoutPlanEndsAt: null,
    lastCheckInAt: index === 0 ? "2026-09-21T07:40:00-03:00" : null,
    assessmentDueAt: null,
    accessEndsAt: null,
    subscribedAt: "2026-06-02T10:00:00-03:00",
    workoutsLast30Days: index === 0 ? 2 : 0,
  })),
  {
    id: "aluno-17",
    name: "Otávio Barros",
    email: "otavio.barros@email.com",
    status: "inactive",
    workoutPlanEndsAt: null,
    lastCheckInAt: "2026-05-10T18:20:00-03:00",
    assessmentDueAt: null,
    accessEndsAt: "2026-06-01T00:00:00-03:00",
    subscribedAt: "2026-03-15T10:00:00-03:00",
    workoutsLast30Days: 0,
  },
];

export const reviews: Review[] = [
  {
    id: "review-1",
    studentId: "aluno-1",
    rating: 5,
    comment: "Curti o treino 💪🔥",
    createdAt: "2026-08-30T19:10:00-03:00",
  },
];

export const completedWorkouts: CompletedWorkout[] = [];

/** Treinos concluídos por dia. `null` = dia ainda não chegou. */
export const weeklyWorkouts: WeeklyWorkoutsPoint[] = [
  { day: "Seg", current: 1, oneWeekAgo: 0, twoWeeksAgo: 0 },
  { day: "Ter", current: 0, oneWeekAgo: 1, twoWeeksAgo: 0 },
  { day: "Qua", current: 0, oneWeekAgo: 0, twoWeeksAgo: 0 },
  { day: "Qui", current: null, oneWeekAgo: 0, twoWeeksAgo: 0 },
  { day: "Sex", current: null, oneWeekAgo: 0, twoWeeksAgo: 0 },
  { day: "Sáb", current: null, oneWeekAgo: 0, twoWeeksAgo: 0 },
  { day: "Dom", current: null, oneWeekAgo: 0, twoWeeksAgo: 0 },
];

export const sales: SalesSummary = {
  receivable: 0,
  available: 0,
  transactions: 0,
};
