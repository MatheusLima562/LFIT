import { Activity, HeartHandshake, TrendingUp, Users } from "lucide-react";
import type { OverviewMetric } from "@/types/dashboard";
import { cn } from "@/lib/utils";
import { InfoHint } from "@/components/ui/InfoHint";

const tones: Record<OverviewMetric["tone"], string> = {
  brand: "bg-canvas text-ink-2",
  violet: "bg-violet-50 text-violet-600",
  neutral: "bg-canvas text-ink-2",
  positive: "bg-success-soft text-success-ink",
};

const icons: Record<string, typeof Users> = {
  ativos: Users,
  engajamento: Activity,
  "treinos-30": TrendingUp,
  retencao: HeartHandshake,
};

/** Colunas no desktop conforme a quantidade de indicadores visíveis (sem buraco no grid). */
const desktopCols: Record<number, string> = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" };

export function OverviewMetrics({ metrics }: { metrics: OverviewMetric[] }) {
  if (!metrics.length) return null;
  return (
    <section
      aria-label="Visão geral"
      className={cn(
        "grid gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-card",
        metrics.length === 1 ? "grid-cols-1" : "grid-cols-2",
        desktopCols[Math.min(metrics.length, 4)],
      )}
    >
      {metrics.map((metric) => {
        const Icon = icons[metric.id] ?? Activity;
        return (
          <div key={metric.id} className="flex min-w-0 items-center gap-3 bg-surface px-4 py-3.5 sm:px-5">
            <span aria-hidden className={cn("hidden size-9 shrink-0 place-items-center rounded-xl sm:grid", tones[metric.tone])}>
              <Icon className="size-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-0.5 text-xs font-medium text-ink-2">
                <span className="truncate">{metric.label}</span>
                {metric.formula && <InfoHint content={metric.formula} />}
              </p>
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
