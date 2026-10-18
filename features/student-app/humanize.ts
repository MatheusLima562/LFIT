/**
 * App do aluno mais humano (2.12, entrega 3.2): textos que dependem de hora, contagem ou data — lógica pura, testada
 * em tests/unit/student-humanize.test.ts. Horários e dias sempre em America/Sao_Paulo.
 */
import { timestampToISODate, todayISO } from "@/lib/dates";

const TZ = "America/Sao_Paulo";

/** Hora (0–23) em São Paulo. */
export function hourInSaoPaulo(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(now));
}

/** "Bom dia" (5h–11h59) · "Boa tarde" (12h–17h59) · "Boa noite" (18h–4h59), pelo relógio de São Paulo. */
export function greeting(name: string, now = new Date()): string {
  const h = hourInSaoPaulo(now);
  const salute = h >= 5 && h < 12 ? "Bom dia" : h >= 12 && h < 18 ? "Boa tarde" : "Boa noite";
  return `${salute}, ${name}!`;
}

/**
 * Constância em destaque, sem cobrança: com zero, um convite neutro. `streak` = semanas seguidas (seg–dom) com ao
 * menos um treino concluído; só aparece a partir de 2 (uma semana sozinha ainda não é sequência).
 */
export function consistency(sessionsThisMonth: number, weekStreak: number): { headline: string; detail: string | null } {
  const headline =
    sessionsThisMonth === 0
      ? "Seu primeiro treino do mês está esperando por você."
      : sessionsThisMonth === 1
        ? "1 treino este mês"
        : `${sessionsThisMonth} treinos este mês`;
  const detail = weekStreak >= 2 ? `${weekStreak} semanas seguidas treinando` : null;
  return { headline, detail };
}

export interface SessionRecord {
  exercise_name: string;
  best_load_now: number;
  prior_best: number | null;
  is_pr: boolean;
}

/** Recordes para o selo: só `is_pr` (o banco já exige carga anterior em sessão concluída, mesma unidade); um por exercício. */
export function recordNames(records: SessionRecord[]): string[] {
  return [...new Set(records.filter((r) => r.is_pr && r.prior_best !== null).map((r) => r.exercise_name))];
}

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "de hoje" · "de ontem" · "de terça" — dia do treino em São Paulo (para "Seu professor respondeu sobre o treino …"). */
export function workoutDayLabel(ts: string, now = new Date()): string {
  const day = timestampToISODate(ts);
  if (day === todayISO(now)) return "de hoje";
  if (day === todayISO(new Date(now.getTime() - 86_400_000))) return "de ontem";
  const [y, m, d] = day.split("-").map(Number);
  return `de ${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}`;
}

/** Iniciais para o avatar do professor ("Caio Exemplo" → "CE"; um nome só → uma letra). */
export function initials(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

/**
 * Teclado virtual aberto (iOS/Android): a área visível encolhe bem mais que a janela. 150 px separa o teclado de
 * variações pequenas (barra de endereço do Safari recolhendo).
 */
export function keyboardLikelyOpen(visualViewportHeight: number, windowHeight: number): boolean {
  return windowHeight - visualViewportHeight > 150;
}
