import { isoToBR, timestampToISODate, todayISO } from "@/lib/dates";
import type { Database } from "@/lib/db/types";

export type ChatRow = Database["public"]["Tables"]["chat_messages"]["Row"];

export const CHAT_MAX_LENGTH = 2000;
export const CHAT_PAGE_SIZE = 50;

export type MessageStatus = "sent" | "sending" | "failed";

/** Mensagem na tela: linha do banco (status "sent") ou envio local ainda sem confirmação. */
export interface ThreadMessage {
  /** Nulo enquanto o banco não confirmou. */
  id: string | null;
  client_msg_id: string;
  student_id: string;
  sender_role: "student" | "staff";
  sender_id: string | null;
  body: string;
  attached_item_id: string | null;
  attached_exercise_name: string | null;
  created_at: string;
  status: MessageStatus;
}

/**
 * Chave de deduplicação: o `client_msg_id` é único por remetente (aluno por student_id, staff por sender_id), então a
 * mesma mensagem vinda do retorno do RPC, do Realtime ou de uma recarga cai sempre na mesma chave.
 */
export function messageKey(m: Pick<ThreadMessage, "sender_role" | "sender_id" | "student_id" | "client_msg_id">): string {
  const sender = m.sender_role === "student" ? `s:${m.student_id}` : `t:${m.sender_id}`;
  return `${sender}:${m.client_msg_id}`;
}

export function fromRow(row: ChatRow): ThreadMessage {
  return {
    id: row.id,
    client_msg_id: row.client_msg_id,
    student_id: row.student_id,
    sender_role: row.sender_role === "staff" ? "staff" : "student",
    sender_id: row.sender_id,
    body: row.body,
    attached_item_id: row.attached_item_id,
    attached_exercise_name: row.attached_exercise_name,
    created_at: row.created_at,
    status: "sent",
  };
}

/** Confirmadas por (created_at, id); envios locais sempre no fim, na ordem em que foram feitos. */
function order(list: ThreadMessage[]): ThreadMessage[] {
  const sent = list.filter((m) => m.status === "sent");
  const local = list.filter((m) => m.status !== "sent");
  sent.sort((a, b) => (a.created_at === b.created_at ? (a.id ?? "").localeCompare(b.id ?? "") : a.created_at < b.created_at ? -1 : 1));
  return [...sent, ...local];
}

/**
 * Junta linhas do banco (página inicial, recarga, Realtime, retorno do envio) com o que está na tela. A linha do banco
 * vence a cópia local de mesma chave (vira "sent"); nada aparece duas vezes, chegue em que ordem chegar.
 */
export function mergeRows(current: ThreadMessage[], rows: ChatRow[]): ThreadMessage[] {
  if (rows.length === 0) return current;
  const byKey = new Map(current.map((m) => [messageKey(m), m]));
  for (const row of rows) byKey.set(messageKey(fromRow(row)), fromRow(row));
  return order([...byKey.values()]);
}

/** Envio otimista: entra no fim como "sending" (substitui uma tentativa anterior com a mesma chave). */
export function addLocal(current: ThreadMessage[], local: ThreadMessage): ThreadMessage[] {
  const key = messageKey(local);
  const existing = current.find((m) => messageKey(m) === key);
  if (existing?.status === "sent") return current;
  return order([...current.filter((m) => messageKey(m) !== key), { ...local, status: "sending" }]);
}

export function setLocalStatus(current: ThreadMessage[], key: string, status: "sending" | "failed"): ThreadMessage[] {
  return current.map((m) => (messageKey(m) === key && m.status !== "sent" ? { ...m, status } : m));
}

export function removeLocal(current: ThreadMessage[], key: string): ThreadMessage[] {
  return current.filter((m) => !(messageKey(m) === key && m.status !== "sent"));
}

/** A mensagem confirmada mais antiga (cursor de "Mensagens anteriores"). */
export function oldestSentAt(list: ThreadMessage[]): string | null {
  return list.find((m) => m.status === "sent")?.created_at ?? null;
}

export interface SendAttempt {
  clientMsgId: string;
  body: string;
  attachedItemId: string | null;
}

/**
 * Id do envio: reenviar o MESMO texto e o MESMO anexo reusa o id da última tentativa (o banco devolve a linha se a
 * primeira já tinha gravado); texto ou anexo editado gera um id novo.
 */
export function pickClientMsgId(last: SendAttempt | null, body: string, attachedItemId: string | null, newId: () => string): string {
  if (last && last.body === body && last.attachedItemId === attachedItemId) return last.clientMsgId;
  return newId();
}

/** Corpo como o banco grava: sem espaços nas pontas, até 2000 caracteres. */
export function normalizeBody(body: string): string {
  return body.trim().slice(0, CHAT_MAX_LENGTH);
}

export type SendFailure = "network" | "rate_limited" | "other";

export const SEND_TIMEOUT_MS = 15_000;

export interface RpcOutcome<T> {
  data: T | null;
  error: { code?: string; message?: string } | null;
}

/**
 * Executa o envio com prazo: passado o prazo, aborta a requisição e devolve um erro de rede; exceção (inclusive
 * síncrona) também vira erro de rede. Nunca fica pendente — o envio sempre termina em "enviada" ou "Não enviada"
 * (e o reenvio usa o mesmo client_msg_id, então uma gravação que chegou ao banco não duplica).
 */
export async function runWithTimeout<T>(
  run: (signal: AbortSignal) => PromiseLike<RpcOutcome<T>>,
  ms: number = SEND_TIMEOUT_MS,
): Promise<RpcOutcome<T>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<RpcOutcome<T>>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ data: null, error: { message: "network timeout" } });
    }, ms);
  });
  const attempt = (async () => {
    try {
      return await run(controller.signal);
    } catch (e) {
      return { data: null, error: { message: `network ${e instanceof Error ? e.name : "error"}` } };
    }
  })();
  try {
    return await Promise.race([attempt, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Erro de rede (sem resposta do servidor) × recusa do banco. */
export function classifySendError(error: { code?: string; message?: string } | null | undefined): SendFailure {
  if (!error) return "other";
  if (error.message === "RATE_LIMITED") return "rate_limited";
  if (!error.code || /fetch|network|load failed/i.test(error.message ?? "")) return "network";
  return "other";
}

/** Separador de dia em São Paulo: "Hoje", "Ontem" ou dd/mm/aaaa. */
export function dayLabel(ts: string, now = new Date()): string {
  const day = timestampToISODate(ts);
  const today = todayISO(now);
  if (day === today) return "Hoje";
  if (day === todayISO(new Date(now.getTime() - 86_400_000))) return "Ontem";
  return isoToBR(day);
}
