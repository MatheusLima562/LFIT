import { CalendarClock, ClipboardList, Wallet } from "lucide-react";
import { isoToBR } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { dueState, type MyPlanSummary } from "../my-plan";

const tt = messages.aluno.profile.training;
const tb = messages.aluno.profile.billing;

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

function Block({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="px-1 text-sm font-semibold text-ink">{title}</h2>
      <dl className="divide-y divide-line rounded-2xl border border-line bg-surface shadow-card">{children}</dl>
    </section>
  );
}

/** "Treino atual" (nome + válido até) e "Plano" (ciclo/valor + próximo pagamento com prazo). Bloco vazio não aparece. */
export function MyPlanCard({ plan }: { plan: MyPlanSummary }) {
  const pay = plan.nextPayment;
  const due = pay ? dueState(pay.dueDate, plan.today) : null;
  const dueText = !due ? null : due.kind === "today" ? tb.dueToday : due.kind === "future" ? tb.dueIn(due.days) : tb.overdue(due.days);
  return (
    <>
      {plan.training && (
        <Block id="my-training-title" title={tt.title}>
          <Line icon={<ClipboardList className="size-4" />} label={tt.name}>
            {plan.training.name}
            <span className="block text-sm text-ink-2">{plan.training.validUntil ? tt.validUntil(isoToBR(plan.training.validUntil)) : tt.noEnd}</span>
          </Line>
        </Block>
      )}
      {(plan.billing || pay) && (
        <Block id="my-billing-title" title={tb.title}>
          {plan.billing && (
            <Line icon={<CalendarClock className="size-4" />} label={tb.cycleLabel}>
              {tb.cycle[plan.billing.cycle]}
              {plan.billing.amountCents !== null && <span className="block text-sm text-ink-2">{tb.amount(formatCurrency(plan.billing.amountCents))}</span>}
            </Line>
          )}
          {pay && (
            <Line icon={<Wallet className="size-4" />} label={tb.nextPayment}>
              {tb.nextPaymentValue(formatCurrency(pay.amountCents), isoToBR(pay.dueDate).slice(0, 5))}
              <span className={cn("block text-sm", due?.kind === "overdue" ? "text-danger-ink" : due?.kind === "today" ? "text-warning-ink" : "text-ink-2")}>
                {dueText}
              </span>
            </Line>
          )}
        </Block>
      )}
    </>
  );
}
