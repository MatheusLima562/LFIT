import { CalendarClock, UserCheck } from "lucide-react";
import type { StatTab } from "@/types/dashboard";
import { Card, CardFooter, CardHeader, CardIcon, CardLink } from "@/components/ui/Card";
import { InfoHint } from "@/components/ui/InfoHint";
import { StatTabs } from "@/components/ui/StatTabs";

export function StudentTrackingCard({ tabs }: { tabs: StatTab[] }) {
  return (
    <Card labelledBy="card-tracking" className="h-full">
      <CardHeader
        id="card-tracking"
        title="Acompanhamento de alunos"
        icon={<CardIcon><UserCheck /></CardIcon>}
        action={<InfoHint content="Treinos a vencer nos próximos 7 dias, vencidos, alunos sem programa e ausentes há mais de 14 dias." />}
      />
      <StatTabs tabs={tabs} label="Situação dos alunos" emptyIcon={<CalendarClock />} maxItems={4} />
      <CardFooter>
        <CardLink href="/alunos">Ver todos</CardLink>
      </CardFooter>
    </Card>
  );
}
