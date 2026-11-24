import { CalendarClock, ClipboardList, Wallet } from "lucide-react";
import { isoToBR } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { dueState, type MyPlanSummary } from "../my-plan";

const t = messages.aluno.profile.myPlan;

function Line({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span aria-hidden className="mt-0.5 text-ink-3">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-ink-3">{label}</dt>
        <dd className="text-[15px] text-ink">{children}</dd>
      </div>
    </div>
  );
}

/** "Meu plano": plano ativo, vencimento com o prazo e, se houver, o valor em aberto do próximo vencimento. */
export function MyPlanCard({ plan }: { plan: MyPlanSummary }) {
  const due = plan.endsOn ? dueState(plan.endsOn, plan.today) : null;
  const dueText = !due ? null : due.kind === "today" ? t.dueToday : due.kind === "future" ? t.dueIn(due.days) : t.overdue(due.days);
  return (
    <section aria-labelledby="my-plan-title" className="flex flex-col gap-2">
      <h2 id="my-plan-title" className="px-1 text-sm font-semibold text-ink">{t.title}</h2>
      <dl className="divide-y divide-line rounded-2xl border border-line bg-surface shadow-card">
        <Line icon={<ClipboardList className="size-4" />} label={t.plan}>{plan.name}</Line>
        <Line icon={<CalendarClock className="size-4" />} label={t.dueDate}>
          {plan.endsOn ? (
            <>
              {isoToBR(plan.endsOn)}{" "}
              <span className={cn("text-sm", due?.kind === "overdue" ? "text-danger-ink" : due?.kind === "today" ? "text-warning-ink" : "text-ink-2")}>
                · {dueText}
              </span>
            </>
          ) : (
            t.noEnd
          )}
        </Line>
        {plan.nextPayment && (
          <Line icon={<Wallet className="size-4" />} label={t.openAmount}>
            {t.openAmountDue(formatCurrency(plan.nextPayment.amountCents), isoToBR(plan.nextPayment.dueDate))}
          </Line>
        )}
      </dl>
    </section>
  );
}
