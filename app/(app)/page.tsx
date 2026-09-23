import type { Metadata } from "next";
import { banner, currentUser } from "@/data/dashboard";
import { getDashboardSummary, getSearchableStudents } from "@/lib/dashboard";
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

export default function DashboardPage() {
  const summary = getDashboardSummary();

  return (
    <DashboardView
      firstName={currentUser.firstName}
      students={getSearchableStudents()}
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
