"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/db/client";
import {
  addLocal,
  CHAT_PAGE_SIZE,
  type ChatRow,
  classifySendError,
  mergeRows,
  messageKey,
  normalizeBody,
  oldestSentAt,
  pickClientMsgId,
  removeLocal,
  type SendAttempt,
  type SendFailure,
  setLocalStatus,
  type ThreadMessage,
} from "./thread";

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
export function useChatThread({ studentId, viewer, initial }: { studentId: string; viewer: ChatViewer; initial: ChatRow[] }) {
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

  const markRead = useCallback(async () => {
    if (!isVisible()) return;
    const { error } = await supabase.rpc("mark_chat_read", { p_student_id: studentId });
    if (!error) window.dispatchEvent(new Event(CHAT_READ_EVENT));
  }, [supabase, studentId]);

  const scheduleMarkRead = useCallback(() => {
    if (markTimer.current) clearTimeout(markTimer.current);
    markTimer.current = setTimeout(() => {
      markTimer.current = null;
      void markRead();
    }, MARK_READ_DELAY_MS);
  }, [markRead]);

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
    const channel = supabase
      .channel(`chat-thread:${studentId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `student_id=eq.${studentId}` },
        (payload) => {
          const row = payload.new as ChatRow;
          setMessages((cur) => mergeRows(cur, [row]));
          if (row.sender_role !== viewer.role) scheduleMarkRead();
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
      });
    return () => {
      disposed = true;
      if (settle) clearTimeout(settle);
      void supabase.removeChannel(channel);
    };
  }, [supabase, studentId, viewer.role, refreshLatest, scheduleMarkRead]);

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
      const { data, error } = await supabase.rpc("send_chat_message", {
        p_student_id: studentId,
        p_body: m.body,
        p_client_msg_id: m.client_msg_id,
        ...(m.attached_item_id ? { p_attached_item_id: m.attached_item_id } : {}),
      });
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
      const clientMsgId = pickClientMsgId(lastAttempt.current, body, attachedItemId, () => crypto.randomUUID());
      lastAttempt.current = { clientMsgId, body, attachedItemId };
      const local: ThreadMessage = {
        id: null,
        client_msg_id: clientMsgId,
        student_id: studentId,
        sender_role: viewer.role,
        sender_id: viewer.role === "staff" ? viewer.staffId : null,
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

/**
 * Selo de não lidas (aba Chat do aluno, menu "Chat" do painel). A contagem vem sempre do banco; o Realtime (pelo RLS)
 * e o evento de "lida" só avisam que é hora de buscar de novo.
 */
export function useChatUnread({ initial, studentId }: { initial: number; studentId: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [count, setCount] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const incomingRole = studentId ? "staff" : "student";

  const refetch = useCallback(async () => {
    const res = studentId
      ? await supabase.rpc("chat_unread_count", { p_student_id: studentId })
      : await supabase.rpc("staff_total_unread_count");
    if (!res.error && typeof res.data === "number") setCount(res.data);
  }, [supabase, studentId]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void refetch(), 500);
  }, [refetch]);

  useEffect(() => {
    let disposed = false;
    let settle: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`chat-unread:${studentId ?? "staff"}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", ...(studentId ? { filter: `student_id=eq.${studentId}` } : {}) },
        (payload) => {
          if (!disposed && (payload.new as ChatRow).sender_role === incomingRole) schedule();
        },
      )
      .subscribe((status) => {
        if (disposed || status !== "SUBSCRIBED") return;
        schedule();
        if (settle) clearTimeout(settle);
        settle = setTimeout(() => !disposed && schedule(), SETTLE_REFETCH_MS);
      });
    const onRead = () => schedule();
    const onVisible = () => isVisible() && schedule();
    window.addEventListener(CHAT_READ_EVENT, onRead);
    window.addEventListener("online", onRead);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      if (settle) clearTimeout(settle);
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener(CHAT_READ_EVENT, onRead);
      window.removeEventListener("online", onRead);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [supabase, studentId, incomingRole, schedule]);

  return count;
}
