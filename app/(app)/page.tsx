import type { Metadata } from "next";
import { banner } from "@/data/dashboard";
import { isAvailableRoute } from "@/data/navigation";
import { getDashboardSummary, visibleMetrics, withRealPlan } from "@/lib/dashboard";
import { requireStaff } from "@/lib/auth/session";
import { getExpiringAccess, getNewStudentTabs, getTrackingTabs } from "@/features/dashboard/queries";
import { getOrganizationPlanUsage } from "@/features/organizations/queries";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { ExpiringAccessCard } from "@/components/dashboard/ExpiringAccessCard";
import { OverviewMetrics } from "@/components/dashboard/OverviewMetrics";
import { PlanCard } from "@/components/dashboard/PlanCard";
import { StudentTrackingCard } from "@/components/dashboard/StudentTrackingCard";
import { SubscribersCard } from "@/components/dashboard/SubscribersCard";

export const metadata: Metadata = {
  title: "Início",
};

/**
 * Regra: nunca exibir número de exemplo como se fosse real. Só entram cards com dados reais:
 * Alunos ativos, Plano, Acompanhamento, Novos alunos e Acesso expirando.
 * Voltam com a Fase 3 (registro de treinos/feedback): Treinos registrados, Treinos concluídos, Treinos da semana,
 * Top 5 e Satisfação. Retenção/Engajamento: 1.6. Avaliação física: quando o módulo existir. Vendas: C8.
 */
export default async function DashboardPage() {
  const session = await requireStaff();
  const [plan, tracking, newStudents, expiring] = await Promise.all([
    getOrganizationPlanUsage(),
    getTrackingTabs(),
    getNewStudentTabs(),
    getExpiringAccess(),
  ]);
  const summary = withRealPlan(getDashboardSummary(), plan);

  return (
    <DashboardView
      firstName={session.firstName}
      // Oferta "Conteúdos Prontos + Limite em Dobro": só aparece quando o destino existir (nada de promessa sem recurso).
      banner={isAvailableRoute(banner.href) ? banner : null}
      cards={{
        overview: <OverviewMetrics metrics={visibleMetrics(summary.metrics)} />,
        tracking: <StudentTrackingCard tabs={tracking} />,
        plan: <PlanCard plan={summary.plan} />,
        subscribers: <SubscribersCard tabs={newStudents} />,
        expiringAccess: <ExpiringAccessCard students={expiring.items} count={expiring.count} />,
      }}
    />
  );
}
