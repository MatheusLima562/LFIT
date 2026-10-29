"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/db/client";
import { uuidV4 } from "@/lib/uuid";
import {
  addLocal,
  CHAT_PAGE_SIZE,
  type ChatMessage,
  classifySendError,
  mergeRows,
  messageKey,
  normalizeBody,
  oldestSentAt,
  latestShownMessageId,
  pickClientMsgId,
  removeLocal,
  runWithTimeout,
  type SendAttempt,
  type SendFailure,
  setLocalStatus,
  type ThreadMessage,
} from "./thread";
import { joinWithAuth } from "./realtime";
import { createUnreadScheduler } from "./unread";

/** Disparado depois de marcar uma conversa como lida: os selos de não lidas buscam a contagem de novo. */
export const CHAT_READ_EVENT = "lfit:chat-read";
const POLL_MS = 20_000;
const MARK_READ_DELAY_MS = 800;
/**
 * O canal fica SUBSCRIBED um pouco antes de o servidor começar a entregar as mudanças da tabela: uma mensagem gravada
 * nessa janela não viria nem pela busca imediata nem pelo Realtime. Por isso há uma segunda busca alguns segundos depois.
 */
export const SETTLE_REFETCH_MS = 3_000;

export interface ChatViewer {
  role: "student" | "staff";
  /** profiles.id do staff (o banco grava sender_id = auth.uid()); nulo para o aluno. */
  staffId: string | null;
}

export interface Attachment {
  id: string;
  name: string;
}

export type SendResult = "sent" | SendFailure;

const isVisible = () => typeof document === "undefined" || document.visibilityState === "visible";

/**
 * Uma conversa: página inicial do servidor + Realtime (só INSERT; o RLS decide quem recebe) + recarga da página mais
 * recente ao (re)conectar, ao voltar a internet e ao voltar à aba. Fora do ar, busca a cada 20 s com a aba visível.
 * O corpo das mensagens nunca é registrado em console.
 */
export function useChatThread({ studentId, viewer, initial }: { studentId: string; viewer: ChatViewer; initial: ChatMessage[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<ThreadMessage[]>(() => mergeRows([], initial));
  const [connected, setConnected] = useState(true);
  const [hasOlder, setHasOlder] = useState(initial.length >= CHAT_PAGE_SIZE);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const lastAttempt = useRef<SendAttempt | null>(null);
  const markTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshLatest = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_chat_messages", { p_student_id: studentId });
    if (!error && data) setMessages((cur) => mergeRows(cur, data));
  }, [supabase, studentId]);

  // Última mensagem confirmada na tela: a leitura vai só até ela (nunca "até agora" — o que chegou depois e ainda não
  // apareceu continua não lido). Espelhada num ref para as marcações disparadas fora da renderização.
  const latestShown = latestShownMessageId(messages);
  const latestShownRef = useRef<string | null>(latestShown);
  useEffect(() => {
    latestShownRef.current = latestShown;
  }, [latestShown]);

  // Último ponto já marcado: o cursor nunca volta, então marcar de novo a mesma mensagem não muda nada (ao abrir, a
  // marcação imediata e a da espera curta caíam na mesma mensagem — duas chamadas e duas recontagens do selo).
  const lastMarked = useRef<string | null>(null);
  const markRead = useCallback(async () => {
    const until = latestShownRef.current;
    if (!until || until === lastMarked.current || !isVisible()) return;
    lastMarked.current = until;
    const { error } = await supabase.rpc("mark_chat_read", { p_student_id: studentId, p_until_message_id: until });
    if (error) {
      if (lastMarked.current === until) lastMarked.current = null;
      return;
    }
    window.dispatchEvent(new Event(CHAT_READ_EVENT));
  }, [supabase, studentId]);

  const scheduleMarkRead = useCallback(() => {
    if (markTimer.current) clearTimeout(markTimer.current);
    markTimer.current = setTimeout(() => {
      markTimer.current = null;
      void markRead();
    }, MARK_READ_DELAY_MS);
  }, [markRead]);

  // Nova mensagem na tela (página inicial, Realtime, recarga ao voltar): marca como lida até ela, com espera curta.
  useEffect(() => {
    if (latestShown) scheduleMarkRead();
  }, [latestShown, scheduleMarkRead]);

  useEffect(() => {
    void markRead();
    return () => {
      // Saiu da conversa com uma marcação pendente: a mensagem já foi vista, marca agora em vez de descartar.
      if (markTimer.current) {
        clearTimeout(markTimer.current);
        markTimer.current = null;
        void markRead();
      }
    };
  }, [markRead]);

  // Realtime: só INSERT (DELETE/UPDATE ignorados). O filtro por aluno só economiza tráfego — quem garante é o RLS.
  useEffect(() => {
    let disposed = false;
    let settle: ReturnType<typeof setTimeout> | null = null;
    const leave = joinWithAuth(supabase, () =>
      supabase
        .channel(`chat-thread:${studentId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chat_messages", filter: `student_id=eq.${studentId}` },
          (payload) => {
            const row = payload.new as ChatMessage;
            setMessages((cur) => mergeRows(cur, [row]));
            // O Realtime não traz o primeiro nome: a recarga traz (get_chat_messages) e o merge preserva.
            if (row.sender_role === "staff" && viewer.role === "student") void refreshLatest();
          },
        )
        .subscribe((status) => {
          if (disposed) return;
          if (status === "SUBSCRIBED") {
            setConnected(true);
            // Fecha a janela entre a página do servidor (ou a queda) e a assinatura — agora e de novo em alguns segundos.
            void refreshLatest();
            if (settle) clearTimeout(settle);
            settle = setTimeout(() => !disposed && void refreshLatest(), SETTLE_REFETCH_MS);
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setConnected(false);
          }
        }),
    );
    return () => {
      disposed = true;
      if (settle) clearTimeout(settle);
      leave();
    };
  }, [supabase, studentId, viewer.role, refreshLatest]);

  // Fora do ar: busca periódica, só com a aba visível.
  useEffect(() => {
    if (connected) return;
    const timer = setInterval(() => {
      if (isVisible()) void refreshLatest();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [connected, refreshLatest]);

  useEffect(() => {
    const onBack = () => {
      if (!isVisible()) return;
      void refreshLatest();
      void markRead();
    };
    window.addEventListener("online", onBack);
    document.addEventListener("visibilitychange", onBack);
    return () => {
      window.removeEventListener("online", onBack);
      document.removeEventListener("visibilitychange", onBack);
    };
  }, [refreshLatest, markRead]);

  const loadOlder = useCallback(async () => {
    const before = oldestSentAt(messages);
    if (!before || loadingOlder) return;
    setLoadingOlder(true);
    const { data, error } = await supabase.rpc("get_chat_messages", { p_student_id: studentId, p_before: before });
    setLoadingOlder(false);
    if (error || !data) return;
    setMessages((cur) => mergeRows(cur, data));
    setHasOlder(data.length >= CHAT_PAGE_SIZE);
  }, [messages, loadingOlder, supabase, studentId]);

  const deliver = useCallback(
    async (m: ThreadMessage): Promise<SendResult> => {
      const key = messageKey(m);
      // Prazo de 15 s: sem resposta, aborta e vira "Não enviada" (o reenvio usa o mesmo client_msg_id).
      const { data, error } = await runWithTimeout((signal) =>
        supabase
          .rpc("send_chat_message", {
            p_student_id: studentId,
            p_body: m.body,
            p_client_msg_id: m.client_msg_id,
            ...(m.attached_item_id ? { p_attached_item_id: m.attached_item_id } : {}),
          })
          .abortSignal(signal),
      );
      if (!error && data) {
        setMessages((cur) => mergeRows(cur, [data]));
        lastAttempt.current = null;
        return "sent";
      }
      const kind = classifySendError(error);
      // Sem rede: a mensagem fica na tela como "Não enviada" (reenvio com o mesmo id). Recusa do banco: volta ao campo.
      setMessages((cur) => (kind === "network" ? setLocalStatus(cur, key, "failed") : removeLocal(cur, key)));
      return kind;
    },
    [supabase, studentId],
  );

  const send = useCallback(
    (rawBody: string, attachment: Attachment | null): Promise<SendResult> => {
      const body = normalizeBody(rawBody);
      const attachedItemId = attachment?.id ?? null;
      const clientMsgId = pickClientMsgId(lastAttempt.current, body, attachedItemId, uuidV4);
      lastAttempt.current = { clientMsgId, body, attachedItemId };
      const local: ThreadMessage = {
        id: null,
        client_msg_id: clientMsgId,
        student_id: studentId,
        sender_role: viewer.role,
        sender_id: viewer.role === "staff" ? viewer.staffId : null,
        sender_first_name: null,
        body,
        attached_item_id: attachedItemId,
        attached_exercise_name: attachment?.name ?? null,
        created_at: new Date().toISOString(),
        status: "sending",
      };
      setMessages((cur) => addLocal(cur, local));
      return deliver(local);
    },
    [deliver, studentId, viewer.role, viewer.staffId],
  );

  /** "Tentar de novo": mesmo texto, mesmo anexo, mesmo id. */
  const retry = useCallback(
    (m: ThreadMessage) => {
      setMessages((cur) => setLocalStatus(cur, messageKey(m), "sending"));
      return deliver(m);
    },
    [deliver],
  );

  /** "Editar": tira a não enviada da lista e devolve texto/anexo ao campo (se não mudar nada, o id é reusado). */
  const edit = useCallback((m: ThreadMessage) => {
    setMessages((cur) => removeLocal(cur, messageKey(m)));
    lastAttempt.current = { clientMsgId: m.client_msg_id, body: m.body, attachedItemId: m.attached_item_id };
  }, []);

  return { messages, connected, hasOlder, loadingOlder, loadOlder, send, retry, edit };
}
const UNREAD_DELAY_MS = 500;
const UNREAD_MIN_INTERVAL_MS = 2_000;

/** Um estado por conversa (aluno) ou por staff: todos os selos da página dividem um canal e uma busca. */
interface UnreadStore {
  count: number | null;
  listeners: Set<() => void>;
  teardown: (() => void) | null;
}
const unreadStores = new Map<string, UnreadStore>();

function startUnread(store: UnreadStore, studentId: string | null) {
  const supabase = createClient();
  const incomingRole = studentId ? "staff" : "student";
  const notify = () => store.listeners.forEach((l) => l());
  const scheduler = createUnreadScheduler(
    async () => {
      const res = studentId
        ? await supabase.rpc("chat_unread_count", { p_student_id: studentId })
        : await supabase.rpc("staff_total_unread_count");
      if (!res.error && typeof res.data === "number" && res.data !== store.count) {
        store.count = res.data;
        notify();
      }
    },
    { delayMs: UNREAD_DELAY_MS, minIntervalMs: UNREAD_MIN_INTERVAL_MS, visible: isVisible },
  );
  let subscribedOnce = false;
  let settle: ReturnType<typeof setTimeout> | null = null;
  const leave = joinWithAuth(supabase, () =>
    supabase
      .channel(`chat-unread:${studentId ?? "staff"}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", ...(studentId ? { filter: `student_id=eq.${studentId}` } : {}) },
        (payload) => {
          if ((payload.new as ChatMessage).sender_role === incomingRole) scheduler.request();
        },
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        // A contagem inicial veio do servidor: na primeira inscrição basta a busca de acomodação (mensagem gravada antes
        // de o canal entregar). Numa reconexão, o que chegou fora do ar só vem pela busca: agora e de novo depois.
        if (subscribedOnce) scheduler.request();
        subscribedOnce = true;
        if (settle) clearTimeout(settle);
        settle = setTimeout(scheduler.request, SETTLE_REFETCH_MS);
      }),
  );
  const onVisible = () => isVisible() && scheduler.request();
  window.addEventListener(CHAT_READ_EVENT, scheduler.request);
  window.addEventListener("online", scheduler.request);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    scheduler.cancel();
    if (settle) clearTimeout(settle);
    window.removeEventListener(CHAT_READ_EVENT, scheduler.request);
    window.removeEventListener("online", scheduler.request);
    document.removeEventListener("visibilitychange", onVisible);
    leave();
  };
}

/**
 * Selo de não lidas (aluno: a própria conversa; staff: `studentId` nulo = soma de todas). A busca sempre vai ao banco; o
 * Realtime, a marcação de lida (`CHAT_READ_EVENT`), a volta da internet e a volta à aba só pedem uma busca, e o
 * agendador junta os pedidos (no máximo uma busca a cada 2 s, nenhuma com a aba oculta).
 */
export function useChatUnread({ initial, studentId }: { initial: number; studentId: string | null }) {
  const key = studentId ?? "staff";
  const subscribe = useCallback(
    (listener: () => void) => {
      let store = unreadStores.get(key);
      if (!store) {
        store = { count: null, listeners: new Set(), teardown: null };
        unreadStores.set(key, store);
      }
      store.listeners.add(listener);
      if (!store.teardown) store.teardown = startUnread(store, studentId);
      const current = store;
      return () => {
        current.listeners.delete(listener);
        if (current.listeners.size === 0) {
          current.teardown?.();
          current.teardown = null;
          unreadStores.delete(key);
        }
      };
    },
    [key, studentId],
  );
  return useSyncExternalStore(
    subscribe,
    () => unreadStores.get(key)?.count ?? initial,
    () => initial,
  );
}
