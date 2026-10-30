import { formatDate } from "@/lib/format";
import { messages } from "@/messages/pt-BR";

/** Regras puras do NPS (testadas em tests/unit/nps.test.ts). A regra que vale é a do banco; aqui só a exibição. */

export const NPS_MIN_RESPONSES = 10;
export const NPS_COMMENT_MAX = 300;
export const NPS_SCORES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export type NpsReason = "not_found" | "no_account" | "inactive" | "recent_response" | "too_early" | "few_sessions" | "snoozed";

/** Resposta de `request_nps` (e o mesmo formato de critérios de `private.nps_eligibility`). */
export interface NpsRequestResult {
  eligible: boolean;
  reason: NpsReason | null;
  available_on?: string | null;
  sessions_done?: number;
  requested?: boolean;
  already?: boolean;
}

export interface NpsQuarter {
  quarter_start: string;
  n: number;
  nps: number | null;
}

export interface NpsDetractor {
  student_id: string;
  student_name: string;
  score: number;
  submitted_at: string;
  comment: string | null;
  comment_hidden: boolean;
}

export interface NpsTrainerRow {
  trainer_id: string | null;
  trainer_name: string;
  n: number;
  promoters: number;
  passives: number;
  detractors: number;
  nps: number | null;
}

/** Saída de `get_nps_summary`. `by_trainer` só para o owner. */
export interface NpsSummary {
  since: string;
  min_n: number;
  n: number;
  promoters: number;
  passives: number;
  detractors: number;
  nps: number | null;
  quarters: NpsQuarter[];
  detractor_list: NpsDetractor[];
  by_trainer: NpsTrainerRow[] | null;
}

export type NpsCategory = "promoter" | "passive" | "detractor";

export function npsCategory(score: number): NpsCategory {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

/** NPS = %promotores − %detratores, arredondado; null abaixo do mínimo de respostas (mesma regra do banco). */
export function npsScore(promoters: number, detractors: number, n: number, min = NPS_MIN_RESPONSES): number | null {
  if (n < min || n === 0) return null;
  return Math.round((100 * (promoters - detractors)) / n);
}

/** "+42" · "0" · "−15" (sinal de menos tipográfico). */
export function formatNps(value: number | null): string {
  if (value === null) return messages.nps.card.noValue;
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}

/** "3º tri 2026" a partir do primeiro dia do trimestre (aaaa-mm-dd). */
export function quarterLabel(quarterStart: string): string {
  const [y, m] = quarterStart.split("-").map(Number);
  return messages.nps.card.quarter(Math.floor((m - 1) / 3) + 1, y);
}

/** Mensagem para o professor depois de "Pedir avaliação": pedido feito, já pedido ou o motivo de ainda não poder. */
export function requestOutcome(r: NpsRequestResult): { ok: boolean; text: string } {
  const t = messages.nps.request;
  if (r.requested) return { ok: true, text: r.already ? t.already : t.sent };
  const done = r.sessions_done ?? 0;
  switch (r.reason) {
    case "no_account":
      return { ok: false, text: t.reasons.no_account };
    case "inactive":
      return { ok: false, text: t.reasons.inactive };
    case "recent_response":
      return { ok: false, text: t.reasons.recent_response(r.available_on ? formatDate(r.available_on) : "") };
    case "too_early":
      return { ok: false, text: t.reasons.too_early(r.available_on ? formatDate(r.available_on) : null, done) };
    case "few_sessions":
      return { ok: false, text: t.reasons.few_sessions(done) };
    case "snoozed":
      return { ok: false, text: t.reasons.snoozed(r.available_on ? formatDate(r.available_on) : "") };
    default:
      return { ok: false, text: t.reasons.not_found };
  }
}
