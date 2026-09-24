import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { messages } from "@/messages/pt-BR";
import { planPeriod, planSituation } from "../format";
import type { PlanSummary } from "../queries";
import { PlanActions } from "./PlanActions";
import type { Option } from "./ApplyTemplateDialog";

const t = messages.plans;

export function PlanStatusBadge({ status }: { status: PlanSummary["status"] }) {
  const style = { draft: "bg-zinc-100 text-zinc-700", active: "bg-emerald-50 text-emerald-700", scheduled: "bg-sky-50 text-sky-700", archived: "bg-zinc-100 text-zinc-600" }[status];
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", style)}>{t.status[status]}</span>;
}

export function PlanCard({
  plan,
  isTemplate = false,
  authorName,
  students,
}: {
  plan: PlanSummary;
  isTemplate?: boolean;
  authorName?: string | null;
  students?: Option[];
}) {
  const situation = !isTemplate && plan.status === "active" ? planSituation(plan.endsOn) : null;
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] font-semibold text-ink">{plan.name}</p>
          {(!isTemplate || plan.status === "archived") && <PlanStatusBadge status={plan.status} />}
          {plan.level && <span className="text-[12px] text-ink-3">{t.levels[plan.level]}</span>}
        </div>
        <p className="mt-0.5 text-[13px] text-ink-2">
          {isTemplate ? (plan.goal ?? t.manage.workouts(plan.workoutLabels)) : planPeriod(plan.startsOn, plan.endsOn)}
          {situation && (
            <span className={cn("ml-2 font-medium", situation.kind === "expired" ? "text-red-700" : situation.kind === "soon" ? "text-amber-800" : "text-ink-3")}>
              · {situation.label}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-[12px] text-ink-3">
          {t.manage.workouts(plan.workoutLabels)} · {t.manage.updated(formatDate(plan.updatedAt))}
          {authorName ? ` · ${t.templates.author(authorName)}` : ""}
        </p>
      </div>
      <PlanActions plan={plan} isTemplate={isTemplate} students={students} />
    </li>
  );
}
