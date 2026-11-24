/** Pausa e ausência (lógica pura). Motivos fixos, sem dado de saúde. */
export const PAUSE_REASONS = ["viagem", "ferias", "outro"] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];

export interface InactiveStudent {
  studentId: string;
  firstName: string;
  lastName: string;
  daysSince: number;
  thresholdDays: number;
  lastSessionAt: string | null;
}

export function parseInactive(raw: unknown): InactiveStudent[] {
  return (Array.isArray(raw) ? raw : []).flatMap((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    if (typeof o.student_id !== "string") return [];
    return [{
      studentId: o.student_id,
      firstName: typeof o.first_name === "string" ? o.first_name : "",
      lastName: typeof o.last_name === "string" ? o.last_name : "",
      daysSince: typeof o.days_since === "number" ? o.days_since : 0,
      thresholdDays: typeof o.threshold_days === "number" ? o.threshold_days : 7,
      lastSessionAt: typeof o.last_session_at === "string" ? o.last_session_at : null,
    }];
  });
}

/** Pausa vale hoje? (sem data = até encerrar; com data = até o fim daquele dia). `today` em aaaa-mm-dd. */
export function pauseActive(until: string | null, today: string): boolean {
  return until === null || until >= today;
}

/**
 * Limite de ausência (o mesmo do banco): o maior entre o padrão (7) e 1,5 × o intervalo previsto pelo plano
 * (dias do plano ÷ sessões previstas), arredondado para cima.
 */
export function absenceThreshold(base: number, plan: { days: number; sessions: number } | null): number {
  if (!plan || plan.sessions <= 0 || plan.days <= 0) return base;
  return Math.max(base, Math.ceil((plan.days / plan.sessions) * 1.5));
}
