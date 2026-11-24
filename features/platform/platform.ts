import { z } from "zod";

/** Painel da plataforma — lógica pura (leitura defensiva das RPCs, formulários). Só dados de conta, nunca de aluno. */
export const PLANS = ["free", "pro", "gold"] as const;
export type Plan = (typeof PLANS)[number];
export const SUBSCRIPTION_STATUSES = ["active", "past_due", "suspended", "canceled"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type AccessState = "ok" | "grace" | "suspended" | "canceled" | "closed";

export interface PlatformAccount {
  id: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  ownerPending: boolean;
  plan: Plan;
  studentLimit: number;
  seatsUsed: number;
  createdAt: string;
  lastAccessAt: string | null;
  status: SubscriptionStatus;
  statusChangedAt: string;
  accessState: AccessState;
  lastPaymentOn: string | null;
  paidUntil: string | null;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown) => (typeof v === "string" && v ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const planOf = (v: unknown): Plan => (PLANS as readonly unknown[]).includes(v) ? (v as Plan) : "free";
const statusOf = (v: unknown): SubscriptionStatus =>
  (SUBSCRIPTION_STATUSES as readonly unknown[]).includes(v) ? (v as SubscriptionStatus) : "active";
const stateOf = (v: unknown): AccessState => (["ok", "grace", "suspended", "canceled", "closed"].includes(v as string) ? (v as AccessState) : "ok");

/** Campos esperados de cada conta. Qualquer outro campo que viesse da RPC é descartado (nunca exibido). */
export function parseAccounts(raw: unknown): PlatformAccount[] {
  return (Array.isArray(raw) ? raw : []).flatMap((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    if (typeof o.id !== "string") return [];
    return [{
      id: o.id,
      name: str(o.name),
      ownerName: str(o.owner_name),
      ownerEmail: str(o.owner_email),
      ownerPending: o.owner_pending === true,
      plan: planOf(o.plan),
      studentLimit: num(o.student_limit),
      seatsUsed: num(o.seats_used),
      createdAt: str(o.created_at),
      lastAccessAt: strOrNull(o.last_access_at),
      status: statusOf(o.subscription_status),
      statusChangedAt: str(o.status_changed_at),
      accessState: stateOf(o.access_state),
      lastPaymentOn: strOrNull(o.last_payment_on),
      paidUntil: strOrNull(o.paid_until),
    }];
  });
}

/**
 * "Pagamento vencido, revisar": o período pago (`paidUntil`, último dia coberto) já passou e a situação continua "Em dia".
 * Só destaque para a plataforma revisar; a situação NUNCA muda sozinha. Sem pagamento registrado → sem destaque.
 * `today` = data civil aaaa-mm-dd (São Paulo).
 */
export function needsPaymentReview(a: Pick<PlatformAccount, "status" | "paidUntil">, today: string): boolean {
  return a.status === "active" && a.paidUntil !== null && a.paidUntil < today;
}

/** Contas a revisar primeiro (as que venceram há mais tempo no topo); o resto mantém a ordem da RPC (mais novas antes). */
export function sortForReview(accounts: PlatformAccount[], today: string): PlatformAccount[] {
  const review = accounts.filter((a) => needsPaymentReview(a, today)).sort((x, y) => x.paidUntil!.localeCompare(y.paidUntil!));
  return [...review, ...accounts.filter((a) => !needsPaymentReview(a, today))];
}

export interface AccountDetail {
  note: string;
  payments: { id: string; paidOn: string; amountCents: number; periodStart: string; periodEnd: string; note: string | null }[];
  audit: { action: string; createdAt: string; detail: unknown }[];
}

export function parseAccountDetail(raw: unknown): AccountDetail {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    note: str(r.note),
    payments: (Array.isArray(r.payments) ? r.payments : []).map((p) => {
      const o = (p ?? {}) as Record<string, unknown>;
      return {
        id: str(o.id), paidOn: str(o.paid_on), amountCents: num(o.amount_cents),
        periodStart: str(o.period_start), periodEnd: str(o.period_end), note: strOrNull(o.note),
      };
    }),
    audit: (Array.isArray(r.audit) ? r.audit : []).map((a) => {
      const o = (a ?? {}) as Record<string, unknown>;
      return { action: str(o.action), createdAt: str(o.created_at), detail: o.detail ?? null };
    }),
  };
}

export { parseMoneyToCents } from "@/lib/money";
import { parseMoneyToCents } from "@/lib/money";

export const createAccountSchema = z.object({
  business: z.string().trim().min(2).max(120),
  owner: z.string().trim().min(2).max(120),
  email: z.email().trim().toLowerCase(),
  plan: z.enum(PLANS),
  limit: z.coerce.number().int().min(1).max(100_000),
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const paymentSchema = z
  .object({
    paidOn: z.iso.date(),
    amount: z.string(),
    periodStart: z.iso.date(),
    periodEnd: z.iso.date(),
    note: z.string().max(500),
  })
  .refine((v) => parseMoneyToCents(v.amount) !== null, { path: ["amount"], message: "amount" })
  .refine((v) => v.periodEnd >= v.periodStart, { path: ["periodEnd"], message: "period" });

/** Dígitos para o link do WhatsApp (wa.me) a partir do E.164. */
export const waDigits = (e164: string) => e164.replace(/\D/g, "");

/** Link do WhatsApp com mensagem pronta (texto vai codificado na URL; nada de dado de aluno nele). */
export function whatsappUrl(text: string, e164?: string | null): string {
  const base = e164 ? `https://wa.me/${waDigits(e164)}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}
