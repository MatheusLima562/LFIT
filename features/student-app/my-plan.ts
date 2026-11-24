/**
 * Bloco "Meu plano" do Perfil do aluno (PARTE 0) — leitura defensiva da RPC `get_my_plan_summary` e o texto do prazo.
 * Só o próprio aluno recebe esses dados; nada de histórico financeiro.
 */
export interface MyPlanSummary {
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  today: string;
  nextPayment: { amountCents: number; dueDate: string } | null;
}

const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export function parseMyPlan(raw: unknown): MyPlanSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const today = isoDate(r.today);
  if (typeof r.name !== "string" || !r.name.trim() || !today) return null;
  const pay = (r.next_payment ?? null) as Record<string, unknown> | null;
  const due = pay ? isoDate(pay.due_date) : null;
  const amount = pay && typeof pay.amount_cents === "number" && Number.isFinite(pay.amount_cents) && pay.amount_cents > 0 ? pay.amount_cents : null;
  return {
    name: r.name.trim(),
    startsOn: isoDate(r.starts_on),
    endsOn: r.no_end === true ? null : isoDate(r.ends_on),
    today,
    nextPayment: due && amount !== null ? { amountCents: amount, dueDate: due } : null,
  };
}

/** Dias entre duas datas civis (aaaa-mm-dd), sem fuso: positivo = no futuro. */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export type DueState = { kind: "future"; days: number } | { kind: "today" } | { kind: "overdue"; days: number };

/** "vence em 12 dias" · "vence hoje" · "vencido há 3 dias". */
export function dueState(endsOn: string, today: string): DueState {
  const d = daysBetween(today, endsOn);
  if (d > 0) return { kind: "future", days: d };
  if (d === 0) return { kind: "today" };
  return { kind: "overdue", days: -d };
}
