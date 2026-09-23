import type { Metadata } from "next";
import { banner } from "@/data/dashboard";
import { getDashboardSummary, withRealPlan } from "@/lib/dashboard";
import { requireStaff } from "@/lib/auth/session";
import { getOrganizationPlanUsage } from "@/features/organizations/queries";
import { CompletedWorkoutsCard } from "@/components/dashboard/CompletedWorkoutsCard";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { ExpiringAccessCard } from "@/components/dashboard/ExpiringAccessCard";
import { OverviewMetrics } from "@/components/dashboard/OverviewMetrics";
import { PhysicalAssessmentCard } from "@/components/dashboard/PhysicalAssessmentCard";
import { PlanCard } from "@/components/dashboard/PlanCard";
import { SalesCard } from "@/components/dashboard/SalesCard";
import { SatisfactionCard } from "@/components/dashboard/SatisfactionCard";
import { StudentTrackingCard } from "@/components/dashboard/StudentTrackingCard";
import { SubscribersCard } from "@/components/dashboard/SubscribersCard";
import { TopStudentsCard } from "@/components/dashboard/TopStudentsCard";
import { WeeklyWorkoutsCard } from "@/components/dashboard/WeeklyWorkoutsCard";

export const metadata: Metadata = {
  title: "Início",
};

export default async function DashboardPage() {
  const [session, plan] = await Promise.all([requireStaff(), getOrganizationPlanUsage()]);
  // Cards ainda com dados mockados até a etapa 1.6 (exceto plano/alunos ativos).
  const summary = withRealPlan(getDashboardSummary(), plan);

  return (
    <DashboardView
      firstName={session.firstName}
      banner={banner}
      cards={{
        overview: <OverviewMetrics metrics={summary.metrics} />,
        tracking: <StudentTrackingCard tabs={summary.tracking} />,
        satisfaction: <SatisfactionCard data={summary.satisfaction} referenceDate={summary.referenceDate} />,
        completed: <CompletedWorkoutsCard items={summary.completedToday} />,
        plan: <PlanCard plan={summary.plan} />,
        subscribers: <SubscribersCard tabs={summary.subscribers} />,
        topStudents: <TopStudentsCard students={summary.topStudents} />,
        assessment: <PhysicalAssessmentCard tabs={summary.assessment} />,
        expiringAccess: <ExpiringAccessCard students={summary.expiringAccess} />,
        weeklyWorkouts: <WeeklyWorkoutsCard data={summary.weeklyWorkouts} />,
        sales: <SalesCard sales={summary.sales} />,
      }}
    />
  );
}
