import { UserPlus, UserRoundPlus } from "lucide-react";
import type { StatTab } from "@/types/dashboard";
import { Card, CardFooter, CardHeader, CardIcon, CardLink } from "@/components/ui/Card";
import { InfoHint } from "@/components/ui/InfoHint";
import { StatTabs } from "@/components/ui/StatTabs";

export function SubscribersCard({ tabs }: { tabs: StatTab[] }) {
  return (
    <Card labelledBy="card-subscribers" className="h-full">
      <CardHeader
        id="card-subscribers"
        title="Novos alunos"
        icon={<CardIcon><UserPlus /></CardIcon>}
        action={<InfoHint content="Alunos cadastrados hoje, nos últimos 7 e nos últimos 30 dias (data de cadastro)." />}
      />
      <StatTabs tabs={tabs} label="Período" emptyIcon={<UserRoundPlus />} defaultTabId="7-dias" />
      <CardFooter>
        <CardLink href="/alunos?sort=created:desc">Ver todos</CardLink>
      </CardFooter>
    </Card>
  );
}
