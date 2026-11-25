import "server-only";
import { createClient } from "@/lib/db/server";

export interface CoachStatus {
  usable: boolean;
  remaining: number;
  dailyLimit: number;
  maxChars: number;
  costMonthMicros: number | null;
}

/**
 * Situação do comando com IA para a tela. Só aparece com a conta ligada (`ai_coach_enabled`, desligado por padrão) e
 * plano Pro/Gold; qualquer falha → não aparece.
 */
export async function getCoachStatus(): Promise<CoachStatus | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_ai_coach_status");
  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  if (r.enabled !== true || r.plan_ok !== true) return null;
  const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    usable: true,
    remaining: n(r.remaining_today, 0),
    dailyLimit: n(r.daily_limit, 0),
    maxChars: n(r.max_input_chars, 300),
    costMonthMicros: typeof r.cost_month_usd_micros === "number" ? r.cost_month_usd_micros : null,
  };
}
