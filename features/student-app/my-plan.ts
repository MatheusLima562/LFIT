/**
 * Perfil do aluno (PARTE 0) — dois blocos lidos de `get_my_plan_summary`:
 * - "Treino atual": nome do plano de treino e "válido até" (nunca "vence" para o treino);
 * - "Plano": ciclo de cobrança e valor (cadastro) e o PRÓXIMO pagamento pendente, com "vence em N dias / vence hoje /
 *   vencido há N dias" só para o pagamento.
 * Só o próprio aluno recebe esses dados; nada de histórico financeiro.
 */
export const BILLING_CYCLES = ["monthly", "quarterly", "semiannual", "annual"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export interface MyPlanSummary {
  today: string;
  training: { name: string; validUntil: string | null } | null;
  billing: { cycle: BillingCycle; amountCents: number | null } | null;
  nextPayment: { amountCents: number; dueDate: string } | null;
}

const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const posInt = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);

export function parseMyPlan(raw: unknown): MyPlanSummary | null {
  const r = obj(raw);
  const today = r ? isoDate(r.today) : null;
  if (!r || !today) return null;
  const tr = obj(r.training);
  const bi = obj(r.billing);
  const pay = obj(r.next_payment);
  const training = tr && typeof tr.name === "string" && tr.name.trim()
    ? { name: tr.name.trim(), validUntil: tr.no_end === true ? null : isoDate(tr.valid_until) }
    : null;
  const billing = bi && (BILLING_CYCLES as readonly unknown[]).includes(bi.cycle)
    ? { cycle: bi.cycle as BillingCycle, amountCents: posInt(bi.amount_cents) }
    : null;
  const due = pay ? isoDate(pay.due_date) : null;
  const amount = pay ? posInt(pay.amount_cents) : null;
  const nextPayment = due && amount !== null ? { amountCents: amount, dueDate: due } : null;
  if (!training && !billing && !nextPayment) return null;
  return { today, training, billing, nextPayment };
}

/** Dias entre duas datas civis (aaaa-mm-dd), sem fuso: positivo = no futuro. */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export type DueState = { kind: "future"; days: number } | { kind: "today" } | { kind: "overdue"; days: number };

/** Prazo do PAGAMENTO: "vence em 12 dias" · "vence hoje" · "vencido há 3 dias". */
export function dueState(dueDate: string, today: string): DueState {
  const d = daysBetween(today, dueDate);
  if (d > 0) return { kind: "future", days: d };
  if (d === 0) return { kind: "today" };
  return { kind: "overdue", days: -d };
}
