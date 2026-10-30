import { formatDate } from "@/lib/format";
import { messages } from "@/messages/pt-BR";

/**
 * Regras puras de exibição do NPS (testadas em tests/unit/nps.test.ts). Quem decide é o banco: critérios e mínimos em
 * `private.nps_settings` (migration 20261030120000); aqui só a tradução para a tela. A equipe nunca recebe nota, nome
 * ou data de um aluno — só agregados por trimestre fechado e o estado do aluno ("pode responder", "indisponível"…).
 */

export const NPS_SCORES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** Agregado de um período: abaixo do mínimo de respostas, só `enough: false` (nem a contagem). */
export type NpsAggregate =
  | { enough: false }
  | { enough: true; n: number; average: number; nps: number; promoters: number; passives: number; detractors: number };

/** Saída de `get_nps_summary` (v2). `by_trainer` só para o owner. */
export interface NpsSummary {
  min_n: number;
  quarter_start: string;
  headline: NpsAggregate;
  quarters: (NpsAggregate & { quarter_start: string })[];
  by_trainer: (NpsAggregate & { trainer_id: string | null; trainer_name: string })[] | null;
}

/** Aceita só o formato v2 (o v1 trazia aluno, nota e comentário de detratores e não pode ser exibido). */
export function isNpsSummary(data: unknown): data is NpsSummary {
  if (!data || typeof data !== "object") return false;
  const d = data as Partial<NpsSummary>;
  return typeof d.min_n === "number" && !!d.headline && typeof d.headline === "object" && Array.isArray(d.quarters);
}

/** Estado do aluno para a equipe (`get_nps_status` / `send_nps_reminder`). Nunca diz se nem quando ele respondeu. */
export interface NpsStaffStatus {
  state: "pending" | "unavailable" | "not_yet" | "no_account" | "inactive" | "none";
  reason?: "too_early" | "few_sessions";
  available_on?: string | null;
  sessions_done?: number;
  sessions_needed?: number;
  days_needed?: number;
  reminded_at?: string | null;
  sent?: boolean;
  already?: boolean;
}

/** "+42" · "0" · "−15" (sinal de menos tipográfico). */
export function formatNps(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}

/** Média 0–10 com uma casa e vírgula: "8,4". */
export function formatAverage(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** "3º tri 2026" a partir do primeiro dia do trimestre (aaaa-mm-dd). */
export function quarterLabel(quarterStart: string): string {
  const [y, m] = quarterStart.split("-").map(Number);
  return messages.nps.card.quarter(Math.floor((m - 1) / 3) + 1, y);
}

/** Frase do estado do aluno para o professor. */
export function statusText(s: NpsStaffStatus): string {
  const t = messages.nps.reminder.states;
  switch (s.state) {
    case "pending":
      return t.pending;
    case "unavailable":
      return t.unavailable;
    case "no_account":
      return t.no_account;
    case "inactive":
      return t.inactive;
    case "not_yet": {
      const done = s.sessions_done ?? 0;
      const needed = s.sessions_needed ?? 0;
      if (s.reason === "few_sessions") return t.few_sessions(done, needed);
      return s.available_on ? t.too_early(s.days_needed ?? 0, formatDate(s.available_on), done, needed) : t.no_sessions(s.days_needed ?? 0, needed);
    }
    default:
      return t.none;
  }
}

/** Resultado de "Enviar lembrete": enviado, já enviado antes, ou o estado que impede. */
export function reminderOutcome(r: NpsStaffStatus): { ok: boolean; text: string } {
  const t = messages.nps.reminder;
  if (r.sent) return { ok: true, text: t.sent };
  if (r.already) return { ok: true, text: r.reminded_at ? t.alreadySent(formatDate(r.reminded_at)) : t.sent };
  return { ok: false, text: statusText(r) };
}
