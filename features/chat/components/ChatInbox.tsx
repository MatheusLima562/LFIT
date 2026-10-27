"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StudentAvatar } from "@/components/students/StudentAvatar";
import { createClient } from "@/lib/db/client";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { CHAT_READ_EVENT, SETTLE_REFETCH_MS } from "../hooks";
import { dayLabel } from "../thread";
import type { InboxEntry } from "../queries";

const t = messages.chat;

const when = (ts: string) => (dayLabel(ts) === "Hoje" ? formatTime(ts) : dayLabel(ts));

/**
 * Caixa de conversas do professor. Busca a lista de novo quando chega mensagem (Realtime, filtrado pelo RLS) ou quando
 * uma conversa é marcada como lida. As fotos assinadas vêm do servidor (a lista nova reaproveita as já emitidas).
 */
export function ChatInbox({ initial, selectedId }: { initial: InboxEntry[]; selectedId: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [entries, setEntries] = useState(initial);
  const photos = useRef(new Map(initial.map((e) => [e.studentId, e.photoUrl])));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useCallback(async () => {
    const { data, error } = await supabase.rpc("list_chat_inbox");
    if (error || !data) return;
    setEntries(
      data.map((r) => ({
        studentId: r.student_id,
        name: r.student_name,
        photoUrl: photos.current.get(r.student_id) ?? null,
        lastMessage: r.last_message,
        lastMessageAt: r.last_message_at,
        lastSenderRole: r.last_sender_role === "staff" ? "staff" : r.last_sender_role === "student" ? "student" : null,
        unread: r.unread_count,
      })),
    );
  }, [supabase]);

  useEffect(() => {
    let settle: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void refetch(), 400);
    };
    const channel = supabase
      .channel("chat-inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, schedule)
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        schedule();
        if (settle) clearTimeout(settle);
        settle = setTimeout(schedule, SETTLE_REFETCH_MS);
      });
    window.addEventListener(CHAT_READ_EVENT, schedule);
    window.addEventListener("online", schedule);
    return () => {
      if (settle) clearTimeout(settle);
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener(CHAT_READ_EVENT, schedule);
      window.removeEventListener("online", schedule);
      void supabase.removeChannel(channel);
    };
  }, [supabase, refetch]);

  if (entries.length === 0) return <p className="px-4 py-10 text-center text-sm text-ink-3">{t.inbox.empty}</p>;

  return (
    <ul aria-label={t.inbox.label} className="flex flex-col">
      {entries.map((e) => {
        const selected = e.studentId === selectedId;
        // A conversa aberta está sendo lida: sem selo enquanto a marcação de lida não volta do banco.
        const unread = selected ? 0 : e.unread;
        return (
          <li key={e.studentId}>
            <Link
              href={`/chat?aluno=${e.studentId}`}
              aria-current={selected ? "page" : undefined}
              aria-label={unread ? `${e.name}, ${t.unread(unread)}` : e.name}
              className={cn(
                "flex items-center gap-3 border-b border-line px-4 py-3 outline-none focus-visible:bg-canvas focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
                selected ? "bg-selected-soft" : "hover:bg-canvas",
              )}
            >
              <StudentAvatar name={e.name} photoUrl={e.photoUrl} size="lg" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn("truncate text-sm", unread ? "font-semibold text-ink" : "font-medium text-ink")}>{e.name}</span>
                  {e.lastMessageAt && <span className="shrink-0 text-[11px] text-ink-3">{when(e.lastMessageAt)}</span>}
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className={cn("truncate text-[13px]", unread ? "text-ink-2" : "text-ink-3")}>{e.lastMessage ?? t.inbox.noMessages}</span>
                  {unread > 0 && (
                    <span aria-hidden className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-ink px-1 text-[10px] font-semibold text-surface">
                      {unread}
                    </span>
                  )}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
