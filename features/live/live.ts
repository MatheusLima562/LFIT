/**
 * AO VIVO — lógica pura (sem React, sem banco). As regras de "quem está ao vivo" e "o que pede atenção" vivem na RPC
 * `get_live_board` (migration 20261119120000); aqui só a leitura defensiva da resposta e os textos de tempo.
 */
import { messages } from "@/messages/pt-BR";

const t = messages.live;

/** Busca de segurança do painel (com a aba visível), além do Realtime. */
export const LIVE_POLL_MS = 30_000;
/** Batimento da tela de execução aberta. */
export const HEARTBEAT_MS = 60_000;
/** Intervalo mínimo entre duas buscas disparadas pelo Realtime (rajadas de séries registradas). */
export const REFETCH_MIN_GAP_MS = 5_000;

export interface LiveEntry {
  session_id: string;
  student_id: string;
  first_name: string;
  last_name: string;
  workout_label: string;
  started_at: string;
  last_event_at: string;
  done: number;
  total: number;
}

export type AttentionKind = "pain" | "session_alert" | "unanswered" | "stalled";
const ATTENTION_KINDS: readonly AttentionKind[] = ["pain", "session_alert", "unanswered", "stalled"];

export interface AttentionEntry {
  kind: AttentionKind;
  student_id: string;
  first_name: string;
  last_name: string;
  since: string;
}

export interface LiveBoard {
  enabled: boolean;
  canConfigure: boolean;
  /** Relógio do banco no momento da busca (corrige a diferença para o relógio do aparelho). */
  serverNow: string;
  live: LiveEntry[];
  attention: AttentionEntry[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function parseLive(v: unknown): LiveEntry | null {
  if (!isObj(v)) return null;
  const session_id = str(v.session_id);
  const student_id = str(v.student_id);
  const started_at = str(v.started_at);
  const last_event_at = str(v.last_event_at);
  if (!session_id || !student_id || !started_at || !last_event_at) return null;
  return {
    session_id,
    student_id,
    first_name: str(v.first_name) ?? "",
    last_name: str(v.last_name) ?? "",
    workout_label: str(v.workout_label) ?? "",
    started_at,
    last_event_at,
    done: Math.max(0, num(v.done) ?? 0),
    total: Math.max(0, num(v.total) ?? 0),
  };
}

function parseAttention(v: unknown): AttentionEntry | null {
  if (!isObj(v)) return null;
  const kind = str(v.kind) as AttentionKind | null;
  const student_id = str(v.student_id);
  const since = str(v.since);
  if (!kind || !ATTENTION_KINDS.includes(kind) || !student_id || !since) return null;
  return { kind, student_id, first_name: str(v.first_name) ?? "", last_name: str(v.last_name) ?? "", since };
}

/** Resposta de `get_live_board` → painel. Formato inesperado = null (o card some, nunca mostra outra coisa). */
export function parseLiveBoard(raw: unknown): LiveBoard | null {
  if (!isObj(raw) || typeof raw.enabled !== "boolean") return null;
  const live = Array.isArray(raw.live) ? raw.live.map(parseLive).filter((e): e is LiveEntry => e !== null) : [];
  const attention = Array.isArray(raw.attention)
    ? raw.attention.map(parseAttention).filter((e): e is AttentionEntry => e !== null)
    : [];
  return {
    enabled: raw.enabled,
    canConfigure: raw.can_configure === true,
    serverNow: str(raw.now) ?? new Date().toISOString(),
    live,
    attention,
  };
}

/** Diferença entre o relógio do banco e o do aparelho (ms), para as durações não dependerem do relógio local. */
export function clockOffset(serverNow: string, localNow = Date.now()): number {
  const s = Date.parse(serverNow);
  return Number.isNaN(s) ? 0 : s - localNow;
}

/** "agora", "8 min", "1 h", "1 h 05 min". */
export function durationLabel(fromIso: string, nowMs: number): string {
  const from = Date.parse(fromIso);
  if (Number.isNaN(from)) return "—";
  const minutes = Math.max(0, Math.floor((nowMs - from) / 60_000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")} min`;
}

export function fullName(e: { first_name: string; last_name: string }): string {
  return `${e.first_name} ${e.last_name}`.trim();
}

/** Texto da linha "Precisa de atenção". A dor só chega aqui no nível completo (a RPC decide). */
export function attentionLabel(e: AttentionEntry, nowMs: number): string {
  const since = durationLabel(e.since, nowMs);
  switch (e.kind) {
    case "pain":
      return t.attention.pain;
    case "session_alert":
      return t.attention.session_alert;
    case "unanswered":
      return t.attention.unanswered(since);
    case "stalled":
      return t.attention.stalled(since);
  }
}

/** Para onde a linha leva: aviso do treino → treinos do aluno; o resto → conversa. */
export function attentionHref(e: AttentionEntry): string {
  return e.kind === "pain" || e.kind === "session_alert" ? `/alunos/${e.student_id}/treinos` : chatHref(e.student_id);
}

export function chatHref(studentId: string): string {
  return `/chat?aluno=${studentId}`;
}

/** Progresso "3/6" limitado ao total (a cópia da divisão pode ter menos itens do que os registros antigos). */
export function progress(e: Pick<LiveEntry, "done" | "total">): { done: number; total: number; pct: number } {
  const total = Math.max(0, e.total);
  const done = Math.min(Math.max(0, e.done), total);
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

// --- Aluno (tela de execução) --------------------------------------------------------------------------------------

export interface CoachMessage {
  id: string;
  body: string;
  created_at: string;
  sender_first_name: string | null;
}

export interface HeartbeatResult {
  liveEnabled: boolean;
  showNotice: boolean;
  message: CoachMessage | null;
}

/** Resposta de `live_heartbeat`. Formato inesperado = nada a mostrar. */
export function parseHeartbeat(raw: unknown): HeartbeatResult {
  if (!isObj(raw)) return { liveEnabled: false, showNotice: false, message: null };
  const m = raw.message;
  const message =
    isObj(m) && str(m.id) && str(m.body) && str(m.created_at)
      ? { id: m.id as string, body: m.body as string, created_at: m.created_at as string, sender_first_name: str(m.sender_first_name) }
      : null;
  return { liveEnabled: raw.live_enabled === true, showNotice: raw.show_notice === true && raw.live_enabled === true, message };
}

/** Mensagem do banner: a mais recente ainda não fechada pelo aluno nesta tela. */
export function bannerMessage(current: CoachMessage | null, incoming: CoachMessage | null, dismissed: ReadonlySet<string>): CoachMessage | null {
  const candidates = [current, incoming].filter((m): m is CoachMessage => m !== null && !dismissed.has(m.id));
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => (Date.parse(b.created_at) > Date.parse(a.created_at) ? b : a));
}
