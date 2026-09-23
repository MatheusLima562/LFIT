import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { messages } from "@/messages/pt-BR";
import { PLAN_FILTERS, studentListHref, type PlanFilter, type StudentListParams } from "../search-params";

const t = messages.students.planFilter;

/** Filtro de treino como links (estado na URL). Contagens entre os alunos ativos. */
export function StudentsPlanFilter({ params, counts }: { params: StudentListParams; counts: Record<PlanFilter, number> }) {
  const chip = (value: PlanFilter | undefined, label: string, count?: number) => {
    const current = params.treino === value;
    return (
      <Link
        key={value ?? "all"}
        href={studentListHref({ ...params, treino: value, page: 1 })}
        aria-current={current ? "true" : undefined}
        scroll={false}
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
          current ? "border-brand-300 bg-brand-50 font-medium text-brand-700" : "border-line bg-surface text-ink-2 hover:text-ink",
        )}
      >
        {label}
        {count !== undefined && <span className="tabular text-xs text-ink-3">{formatNumber(count)}</span>}
      </Link>
    );
  };
  return (
    <nav aria-label={t.label} className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] font-medium text-ink-2">{t.label}:</span>
      {chip(undefined, t.all)}
      {PLAN_FILTERS.map((f) => chip(f, t[f], counts[f]))}
      <span className="sr-only">{t.hint}</span>
    </nav>
  );
}
