import { ClipboardCheck, Ruler } from "lucide-react";
import type { StatTab } from "@/types/dashboard";
import { Card, CardFooter, CardHeader, CardIcon, CardLink } from "@/components/ui/Card";
import { StatTabs } from "@/components/ui/StatTabs";

export function PhysicalAssessmentCard({ tabs }: { tabs: StatTab[] }) {
  return (
    <Card labelledBy="card-assessment" className="h-full">
      <CardHeader id="card-assessment" title="Avaliação física" icon={<CardIcon><ClipboardCheck /></CardIcon>} />
      <StatTabs tabs={tabs} label="Situação das avaliações" emptyIcon={<Ruler />} />
      <CardFooter>
        <CardLink href="/avaliacao">Ver todos</CardLink>
      </CardFooter>
    </Card>
  );
}
