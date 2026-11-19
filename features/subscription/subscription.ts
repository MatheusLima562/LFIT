/** Assinatura do personal (lógica pura): leitura de `get_my_subscription` e o que a tela faz em cada estado. */
export type AccessState = "ok" | "grace" | "suspended" | "canceled" | "closed";

export interface MySubscription {
  status: "active" | "past_due" | "suspended" | "canceled";
  state: AccessState;
  graceEndsAt: string | null;
  accessEndsAt: string | null;
  plan: string;
  studentLimit: number;
  paidUntil: string | null;
  supportWhatsapp: string | null;
  supportEmail: string | null;
}

const strOrNull = (v: unknown) => (typeof v === "string" && v ? v : null);

export function parseSubscription(raw: unknown): MySubscription {
  const r = (raw ?? {}) as Record<string, unknown>;
  const state = ["ok", "grace", "suspended", "canceled", "closed"].includes(r.state as string) ? (r.state as AccessState) : "ok";
  const status = ["active", "past_due", "suspended", "canceled"].includes(r.status as string) ? (r.status as MySubscription["status"]) : "active";
  return {
    status,
    state,
    graceEndsAt: strOrNull(r.grace_ends_at),
    accessEndsAt: strOrNull(r.access_ends_at),
    plan: typeof r.plan === "string" ? r.plan : "",
    studentLimit: typeof r.student_limit === "number" ? r.student_limit : 0,
    paidUntil: strOrNull(r.paid_until),
    supportWhatsapp: strOrNull(r.support_whatsapp),
    supportEmail: strOrNull(r.support_email),
  };
}

/** Dias inteiros até o fim da tolerância (mínimo 1 enquanto ainda está em tolerância). */
export function daysLeft(until: string | null, now: number): number {
  if (!until) return 0;
  return Math.max(1, Math.ceil((new Date(until).getTime() - now) / 86_400_000));
}

/** Somente leitura (banco recusa gravações com ACCOUNT_READ_ONLY). */
export const isReadOnly = (state: AccessState) => state === "suspended" || state === "canceled" || state === "closed";

/** Conta encerrada: o personal só acessa Configurações (exportar) e Regularizar; a equipe não acessa. */
export function closedAllows(pathname: string, role: "owner" | "trainer"): boolean {
  if (role !== "owner") return false;
  return ["/configuracoes", "/regularizar", "/suporte"].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
