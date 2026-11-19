"use client";

import Link from "next/link";
import { Eye, MessageCircle, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { joinWithAuth } from "@/features/chat/realtime";
import { createClient } from "@/lib/db/client";
import { messages } from "@/messages/pt-BR";
import { bannerMessage, HEARTBEAT_MS, parseHeartbeat, type CoachMessage } from "../live";

const t = messages.live;

const isVisible = () => typeof document === "undefined" || document.visibilityState === "visible";

/**
 * Acompanha a tela de execução aberta: batimento a cada 60 s (só com a aba visível; o banco limita a uma gravação a
 * cada 30 s), aviso de transparência no primeiro treino e banner com a mensagem nova do professor (sem push).
 * Fica no fluxo da página, acima do exercício: nunca cobre "Feita" nem os botões de baixo. `self = false` (modo
 * presencial) só envia o batimento. O corpo da mensagem nunca vai para console, URL ou notificação.
 */
export function LiveCompanion({ sessionId, self, active }: { sessionId: string; self: boolean; active: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [notice, setNotice] = useState(false);
  const [message, setMessage] = useState<CoachMessage | null>(null);
  const dismissed = useRef<Set<string>>(new Set());

  const beat = useCallback(async () => {
    if (!isVisible()) return;
    try {
      const { data, error } = await supabase.rpc("live_heartbeat", { p_session_id: sessionId });
      if (error) return;
      const r = parseHeartbeat(data);
      if (!self) return;
      setNotice(r.showNotice);
      setMessage((cur) => bannerMessage(cur, r.message, dismissed.current));
    } catch {
      // Sem rede: o próximo batimento tenta de novo.
    }
  }, [supabase, sessionId, self]);

  useEffect(() => {
    if (!active) return;
    const first = window.setTimeout(() => void beat(), 0);
    const id = window.setInterval(() => void beat(), HEARTBEAT_MS);
    const onVisible = () => isVisible() && void beat();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, beat]);

  // Mensagem nova do professor: o RLS entrega ao aluno só a própria conversa; o evento só dispara a busca.
  useEffect(() => {
    if (!self || !active) return;
    return joinWithAuth(supabase, () =>
      supabase
        .channel(`live-student:${sessionId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (p) => {
          if ((p.new as { sender_role?: string }).sender_role === "staff") void beat();
        })
        .subscribe(),
    );
  }, [supabase, sessionId, self, active, beat]);

  const ack = async () => {
    setNotice(false);
    try {
      await supabase.rpc("ack_live_notice");
    } catch {
      // Sem rede: o aviso volta no próximo treino, sem prejuízo.
    }
  };

  const close = (id: string) => {
    dismissed.current.add(id);
    setMessage(null);
  };

  if (!self || (!notice && !message)) return null;

  return (
    <div className="flex flex-col gap-2">
      {notice && (
        <section aria-labelledby="live-notice" className="rounded-xl border border-info-line bg-info-soft px-3 py-2.5 text-info-ink">
          <h2 id="live-notice" className="flex items-center gap-1.5 text-[13px] font-semibold">
            <Eye aria-hidden className="size-4" />
            {t.noticeTitle}
          </h2>
          <p className="mt-1 text-[13px]">{t.noticeBody}</p>
          <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => void ack()}>
            {t.noticeOk}
          </Button>
        </section>
      )}
      {message && (
        <section role="status" aria-labelledby="live-message" className="rounded-xl border border-line bg-surface px-3 py-2.5 shadow-card">
          <div className="flex items-start justify-between gap-2">
            <h2 id="live-message" className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
              <MessageCircle aria-hidden className="size-4" />
              {t.messageFrom(message.sender_first_name)}
            </h2>
            <button
              type="button"
              aria-label={t.messageClose}
              onClick={() => close(message.id)}
              className="-m-1.5 grid size-9 shrink-0 place-items-center rounded-lg text-ink-3 outline-none hover:bg-canvas focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <p className="mt-1 line-clamp-3 text-[13px] whitespace-pre-line text-ink-2">{message.body}</p>
          <Link href="/aluno/chat" className="link mt-1.5 inline-block text-[13px]">
            {t.messageReply}
          </Link>
        </section>
      )}
    </div>
  );
}
