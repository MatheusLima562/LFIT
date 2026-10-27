import type { Metadata } from "next";
import { banner } from "@/data/dashboard";
import { isAvailableRoute } from "@/data/navigation";
import { requireStaff } from "@/lib/auth/session";
import { formatNumber } from "@/lib/format";
import {
  getEngagementStats,
  getExpiringAccess,
  getNewStudentTabs,
  getTrackingTabs,
  getTrainingStats,
} from "@/features/dashboard/queries";
import { completedComparison, completedToday, satisfaction, topStudents, trainingMetrics, weekPoints } from "@/features/dashboard/stats";
import { getOrganizationPlanUsage } from "@/features/organizations/queries";
import type { OverviewMetric } from "@/types/dashboard";
import { CompletedWorkoutsCard } from "@/components/dashboard/CompletedWorkoutsCard";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { ExpiringAccessCard } from "@/components/dashboard/ExpiringAccessCard";
import { OverviewMetrics } from "@/components/dashboard/OverviewMetrics";
import { PlanCard } from "@/components/dashboard/PlanCard";
import { SatisfactionCard } from "@/components/dashboard/SatisfactionCard";
import { StudentTrackingCard } from "@/components/dashboard/StudentTrackingCard";
import { SubscribersCard } from "@/components/dashboard/SubscribersCard";
import { TopStudentsCard } from "@/components/dashboard/TopStudentsCard";
import { WeeklyWorkoutsCard } from "@/components/dashboard/WeeklyWorkoutsCard";

export const metadata: Metadata = {
  title: "Início",
};

/**
 * Regra: nunca exibir número de exemplo como se fosse real. Todos os cards vêm do banco, no escopo de quem está logado
 * (owner: organização; professor: os seus alunos). Treinos, engajamento, retenção e satisfação vêm das RPCs do
 * dashboard (docs/planos/dashboard-inicio.md): se elas falharem, esses cards somem em vez de mostrar outra coisa.
 * Sem nota de satisfação nos últimos 30 dias, o card Satisfação some. Avaliação física e Vendas: módulos "Em breve".
 */
export default async function DashboardPage() {
  const session = await requireStaff();
  const [plan, tracking, newStudents, expiring, training, engagement] = await Promise.all([
    getOrganizationPlanUsage(),
    getTrackingTabs(),
    getNewStudentTabs(),
    getExpiringAccess(),
    getTrainingStats(),
    getEngagementStats(),
  ]);

  const active: OverviewMetric = {
    id: "ativos",
    label: "Alunos ativos",
    value: formatNumber(plan.used),
    hint: `de ${plan.limit} no plano ${plan.planName}`,
    tone: "brand",
  };
  const metrics = [active, ...trainingMetrics(training, engagement)];
  const rating = satisfaction(engagement);

  return (
    <DashboardView
      firstName={session.firstName}
      // Oferta "Conteúdos Prontos + Limite em Dobro": só aparece quando o destino existir (nada de promessa sem recurso).
      banner={isAvailableRoute(banner.href) ? banner : null}
      cards={{
        overview: <OverviewMetrics metrics={metrics} />,
        tracking: <StudentTrackingCard tabs={tracking} />,
        plan: <PlanCard plan={plan} />,
        subscribers: <SubscribersCard tabs={newStudents} />,
        expiringAccess: <ExpiringAccessCard students={expiring.items} count={expiring.count} />,
        ...(training && {
          completed: (
            <CompletedWorkoutsCard items={completedToday(training)} count={training.completed_today_count} comparison={completedComparison(training)} />
          ),
          weeklyWorkouts: <WeeklyWorkoutsCard data={weekPoints(training)} lastWeekToDate={training.last_week_total_to_date} />,
          topStudents: <TopStudentsCard students={topStudents(training)} />,
        }),
        ...(rating && { satisfaction: <SatisfactionCard data={rating} /> }),
      }}
    />
  );
}
