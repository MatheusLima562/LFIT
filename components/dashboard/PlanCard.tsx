import { Gauge } from "lucide-react";
import type { PlanUsage } from "@/types/dashboard";
import { formatNumber, plural } from "@/lib/format";
import { Card, CardFooter, CardHeader, CardIcon, CardLink } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";

export function PlanCard({ plan }: { plan: PlanUsage }) {
  const pct = plan.limit ? Math.round((plan.used / plan.limit) * 100) : 0;
  return (
    <Card labelledBy="card-plan" className="h-full">
      <CardHeader
        id="card-plan"
        title="Plano"
        icon={<CardIcon><Gauge /></CardIcon>}
        action={
          <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-100">
            {plan.planName}
          </span>
        }
      />
      <p className="flex items-baseline gap-1.5">
        <span className="tabular text-3xl leading-none font-semibold tracking-tight text-ink">
          {formatNumber(plan.used)}
        </span>
        <span className="text-[13px] text-ink-2">de {plural(plan.limit, "aluno")}</span>
      </p>
      <ProgressBar value={plan.used} max={plan.limit} label="Uso do plano" className="mt-3 h-2.5" />
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="font-medium text-ink-2">{plural(plan.remaining, "vaga restante", "vagas restantes")}</span>
        <span className="tabular text-ink-3">{pct}%</span>
      </div>
      <p className="mt-1 text-xs text-ink-3">
        {plan.inactive === 1
          ? "1 inativo não ocupa vaga"
          : `${formatNumber(plan.inactive)} inativos não ocupam vaga`}
      </p>
      <CardFooter>
        <CardLink href="/vendas/planos">Gerenciar plano</CardLink>
      </CardFooter>
    </Card>
  );
}
