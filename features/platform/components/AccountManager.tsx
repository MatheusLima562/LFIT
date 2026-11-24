"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { callAction } from "@/lib/action";
import { createClient } from "@/lib/db/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { regenerateOwnerLink } from "../actions";
import { PLANS, SUBSCRIPTION_STATUSES, parseMoneyToCents, paymentSchema, type AccountDetail, type Plan, type PlatformAccount, type SubscriptionStatus } from "../platform";
import { InviteLinkPanel } from "./InviteLinkPanel";

const t = messages.platform;
const d = t.detail;
const box = "flex flex-col gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line";
const label = "text-sm font-medium text-ink";
const select = "h-10 w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring";
const today = () => new Date().toISOString().slice(0, 10);

/** Ações da plataforma sobre uma conta. Do navegador direto para as RPCs (todas auditadas no banco). */
export function AccountManager({ account, detail }: { account: PlatformAccount; detail: AccountDetail }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [plan, setPlan] = useState<Plan>(account.plan);
  const [limit, setLimit] = useState(String(account.studentLimit));
  const [status, setStatus] = useState<SubscriptionStatus>(account.status);
  const [note, setNote] = useState(detail.note);
  const [link, setLink] = useState<string | null>(null);
  const [pay, setPay] = useState(() => ({ paidOn: today(), amount: "", periodStart: today(), periodEnd: "", note: "" }));

  const run = async (key: string, fn: () => PromiseLike<{ error: { message?: string; code?: string } | null }>, ok: string) => {
    setBusy(key);
    try {
      const { error } = await fn();
      if (error) return void toast.error(dbErrorMessage(error));
      toast.success(ok);
      router.refresh();
    } catch {
      toast.error(t.failed);
    } finally {
      setBusy(null);
    }
  };

  const payValid = paymentSchema.safeParse(pay).success;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section aria-labelledby={`${id}-plan`} className={box}>
        <h2 id={`${id}-plan`} className="text-[15px] font-semibold text-ink">{d.plan}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-plan-select`} className={label}>{t.create.plan}</label>
            <select id={`${id}-plan-select`} value={plan} onChange={(e) => setPlan(e.target.value as Plan)} className={select}>
              {PLANS.map((p) => <option key={p} value={p}>{t.plans[p]}</option>)}
            </select>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className={label}>{t.create.limit}</span>
            <Input type="number" min={1} max={100000} value={limit} onChange={(e) => setLimit(e.target.value)} />
          </label>
        </div>
        <p className="text-xs text-ink-3">{t.seats(account.seatsUsed, account.studentLimit)}</p>
        <Button type="button" className="self-start" disabled={busy !== null || !(Number(limit) >= 1)}
          onClick={() => void run("plan", () => supabase.rpc("platform_update_plan", { p_org: account.id, p_plan: plan, p_student_limit: Number(limit) }), d.planSaved)}>
          {d.savePlan}
        </Button>
      </section>

      <section aria-labelledby={`${id}-status`} className={box}>
        <h2 id={`${id}-status`} className="text-[15px] font-semibold text-ink">{d.status}</h2>
        {/* Rótulo explícito: com o <select> dentro do <label>, o nome acessível incluiria a opção escolhida. */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-status-select`} className={label}>{t.columns.status}</label>
          <select id={`${id}-status-select`} value={status} onChange={(e) => setStatus(e.target.value as SubscriptionStatus)} className={select}>
            {SUBSCRIPTION_STATUSES.map((s) => <option key={s} value={s}>{t.status[s]}</option>)}
          </select>
        </div>
        <p className="text-xs text-ink-3">{t.state[account.accessState]} · {d.statusHint}</p>
        <Button type="button" className="self-start" disabled={busy !== null || status === account.status}
          onClick={() => void run("status", () => supabase.rpc("platform_set_status", { p_org: account.id, p_status: status }), d.statusSaved)}>
          {d.saveStatus}
        </Button>
      </section>

      <section aria-labelledby={`${id}-pay`} className={box}>
        <h2 id={`${id}-pay`} className="text-[15px] font-semibold text-ink">{d.payment}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5"><span className={label}>{d.paidOn}</span>
            <Input type="date" value={pay.paidOn} onChange={(e) => setPay({ ...pay, paidOn: e.target.value })} /></label>
          <label className="flex flex-col gap-1.5"><span className={label}>{d.amount}</span>
            <Input inputMode="decimal" placeholder="99,90" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></label>
          <label className="flex flex-col gap-1.5"><span className={label}>{d.periodStart}</span>
            <Input type="date" value={pay.periodStart} onChange={(e) => setPay({ ...pay, periodStart: e.target.value })} /></label>
          <label className="flex flex-col gap-1.5"><span className={label}>{d.periodEnd}</span>
            <Input type="date" value={pay.periodEnd} onChange={(e) => setPay({ ...pay, periodEnd: e.target.value })} /></label>
        </div>
        <label className="flex flex-col gap-1.5"><span className={label}>{d.paymentNote}</span>
          <Input maxLength={500} value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></label>
        <Button type="button" className="self-start" disabled={busy !== null || !payValid}
          onClick={() =>
            void run("pay", () => supabase.rpc("platform_record_payment", {
              p_org: account.id, p_paid_on: pay.paidOn, p_amount_cents: parseMoneyToCents(pay.amount)!,
              p_period_start: pay.periodStart, p_period_end: pay.periodEnd, p_note: pay.note,
            }), d.paymentSaved).then(() => setPay((p) => ({ ...p, amount: "", note: "" })))
          }>
          {d.savePayment}
        </Button>
        <h3 className="mt-2 text-sm font-semibold text-ink">{d.payments}</h3>
        {detail.payments.length === 0 ? (
          <p className="text-xs text-ink-3">{d.noPayments}</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {detail.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{formatDate(p.paidOn)} · {formatCurrency(p.amountCents)}</span>
                <span className="text-ink-3">{formatDate(p.periodStart)} – {formatDate(p.periodEnd)}{p.note ? ` · ${p.note}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={`${id}-note`} className={box}>
        <h2 id={`${id}-note`} className="text-[15px] font-semibold text-ink">{d.note}</h2>
        <Textarea rows={4} maxLength={2000} value={note} aria-describedby={`${id}-nh`} onChange={(e) => setNote(e.target.value)} />
        <p id={`${id}-nh`} className="text-xs text-ink-3">{d.noteHint}</p>
        <Button type="button" className="self-start" disabled={busy !== null || note === detail.note}
          onClick={() => void run("note", () => supabase.rpc("platform_set_note", { p_org: account.id, p_note: note }), d.noteSaved)}>
          {d.saveNote}
        </Button>
        <h3 className="mt-2 text-sm font-semibold text-ink">{t.invite.label}</h3>
        {link ? (
          <InviteLinkPanel url={link} name={account.ownerName.split(" ")[0] ?? ""} />
        ) : (
          <Button type="button" variant="outline" className="self-start" disabled={pending}
            onClick={() => start(async () => {
              const r = await callAction(() => regenerateOwnerLink(account.id));
              if (!r) return;
              if (!r.ok) return void toast.error(r.error);
              toast.success(t.invite.regenerated);
              setLink(r.url);
            })}>
            {t.invite.regenerate}
          </Button>
        )}
      </section>

      <section aria-labelledby={`${id}-audit`} className={`${box} lg:col-span-2`}>
        <h2 id={`${id}-audit`} className="text-[15px] font-semibold text-ink">{d.audit}</h2>
        {detail.audit.length === 0 ? (
          <p className="text-xs text-ink-3">{d.noAudit}</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {detail.audit.map((a, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{d.actions[a.action] ?? a.action}</span>
                <span className="text-ink-3">{formatDate(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
