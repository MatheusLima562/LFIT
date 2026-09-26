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
        action={<InfoHint content="Entre os alunos ativos: treino ativo que vence nos próximos 7 dias, treino vencido e sem treino ativo (mesmos filtros de Meus alunos)." />}
      />
      <StatTabs tabs={tabs} label="Situação dos alunos" emptyIcon={<CalendarClock />} maxItems={4} />
      <CardFooter>
        <CardLink href="/alunos">Ver todos</CardLink>
      </CardFooter>
    </Card>
  );
}
