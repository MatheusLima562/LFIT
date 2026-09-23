import { Activity, HeartHandshake, TrendingUp, Users } from "lucide-react";
import type { OverviewMetric } from "@/types/dashboard";
import { cn } from "@/lib/utils";

const tones: Record<OverviewMetric["tone"], string> = {
  brand: "bg-brand-50 text-brand-600",
  violet: "bg-violet-50 text-violet-600",
  neutral: "bg-canvas text-ink-2",
  positive: "bg-emerald-50 text-emerald-600",
};

const icons: Record<string, typeof Users> = {
  ativos: Users,
  engajamento: Activity,
  "treinos-30": TrendingUp,
  retencao: HeartHandshake,
};

export function OverviewMetrics({ metrics }: { metrics: OverviewMetric[] }) {
  return (
    <section aria-label="Visão geral" className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-card lg:grid-cols-4">
      {metrics.map((metric) => {
        const Icon = icons[metric.id] ?? Activity;
        return (
          <div key={metric.id} className="flex min-w-0 items-center gap-3 bg-surface px-4 py-3.5 sm:px-5">
            <span aria-hidden className={cn("hidden size-9 shrink-0 place-items-center rounded-xl sm:grid", tones[metric.tone])}>
              <Icon className="size-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-ink-2">{metric.label}</p>
              <p className="flex items-baseline gap-2">
                <span className="tabular text-xl font-semibold tracking-tight text-ink">{metric.value}</span>
                <span className="hidden truncate text-xs text-ink-3 xl:inline">{metric.hint}</span>
              </p>
              <p className="truncate text-xs text-ink-3 xl:hidden">{metric.hint}</p>
            </div>
          </div>
        );
      })}
    </section>
  );
}
