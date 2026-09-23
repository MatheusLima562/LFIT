import { UserPlus, UserRoundPlus } from "lucide-react";
import type { StatTab } from "@/types/dashboard";
import { Card, CardFooter, CardHeader, CardIcon, CardLink } from "@/components/ui/Card";
import { StatTabs } from "@/components/ui/StatTabs";

export function SubscribersCard({ tabs }: { tabs: StatTab[] }) {
  return (
    <Card labelledBy="card-subscribers" className="h-full">
      <CardHeader id="card-subscribers" title="Novos assinantes" icon={<CardIcon><UserPlus /></CardIcon>} />
      <StatTabs tabs={tabs} label="Período" emptyIcon={<UserRoundPlus />} defaultTabId="7-dias" />
      <CardFooter>
        <CardLink href="/vendas/cobrancas">Ver todos assinantes</CardLink>
      </CardFooter>
    </Card>
  );
}
