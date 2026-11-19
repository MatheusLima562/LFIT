"use client";

import Link from "next/link";
import { AlertTriangle, Clock, MessageCircle, PauseCircle, Radio } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardIcon } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { joinWithAuth } from "@/features/chat/realtime";
import { createClient } from "@/lib/db/client";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import {
  attentionHref,
  attentionLabel,
  chatHref,
  clockOffset,
  durationLabel,
  fullName,
  LIVE_POLL_MS,
  parseLiveBoard,
  progress,
  REFETCH_MIN_GAP_MS,
  type AttentionEntry,
  type LiveBoard,
} from "../live";
import { createRefetchDebouncer, type RefetchDebouncer } from "../debounce";

const t = messages.live;

const isVisible = () => typeof document === "undefined" || document.visibilityState === "visible";

/**
 * AO VIVO no topo do Início. Mostra estado, nunca promete resposta. Nada de dado de saúde: nome, divisão, progresso e
 * tempo; o aviso de dor só aparece no nível completo (decidido pela RPC). Realtime em `live_sessions` e `chat_messages`
 * (filtrado pela organização; o RLS decide o que chega) só dispara a busca; a busca a cada 30 s cobre o Realtime fora.
 */
export function LiveBoardCard({ initial, organizationId }: { initial: LiveBoard; organizationId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [board, setBoard] = useState(initial);
  const [offset, setOffset] = useState(() => clockOffset(initial.serverNow));
  const [now, setNow] = useState(() => Date.now());
  const [confirmOff, setConfirmOff] = useState(false);
  const [pending, startTransition] = useTransition();
  const debouncer = useRef<RefetchDebouncer | null>(null);

  const refetch = useCallback(async () => {
    debouncer.current?.markFetched();
    const { data, error } = await supabase.rpc("get_live_board");
    if (error) return;
    const next = parseLiveBoard(data);
    if (!next) return;
    setBoard(next);
    setOffset(clockOffset(next.serverNow));
    setNow(Date.now());
  }, [supabase]);

  // Realtime → recarga com debounce: rajadas viram uma recarga, nunca a menos de 5 s da anterior.
  useEffect(() => {
    if (!board.enabled) return;
    const d = createRefetchDebouncer(() => isVisible() && void refetch(), { minGapMs: REFETCH_MIN_GAP_MS });
    debouncer.current = d;
    const leave = joinWithAuth(supabase, () =>
      supabase
        .channel(`live:${organizationId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "live_sessions", filter: `organization_id=eq.${organizationId}` }, () => d.trigger())
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `organization_id=eq.${organizationId}` }, () => d.trigger())
        .subscribe(),
    );
    return () => {
      leave();
      d.dispose();
      debouncer.current = null;
    };
  }, [supabase, organizationId, board.enabled, refetch]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (isVisible()) void refetch();
    }, LIVE_POLL_MS);
    const onVisible = () => isVisible() && void refetch();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refetch]);

  const setEnabled = (enabled: boolean) =>
    startTransition(async () => {
      const { error } = await supabase.rpc("set_live_enabled", { p_enabled: enabled });
      if (error) {
        toast.error(t.failed);
        return;
      }
      toast.success(enabled ? t.turnedOn : t.turnedOff);
      setConfirmOff(false);
      await refetch();
    });

  const nowMs = now + offset;

  if (!board.enabled) {
    // Desligado: só o owner vê (para poder religar); o professor não tem o que fazer aqui.
    if (!board.canConfigure) return null;
    return (
      <Card labelledBy="card-live">
        <CardHeader id="card-live" title={t.title} icon={<CardIcon><Radio /></CardIcon>} className="mb-2" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-ink-2">{t.off}</p>
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setEnabled(true)}>
            {t.turnOn}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card labelledBy="card-live">
      <CardHeader
        id="card-live"
        title={
          <span className="flex items-center gap-2">
            {t.training}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold tracking-wide text-success-ink ring-1 ring-success-line">
              <span aria-hidden className="size-1.5 rounded-full bg-success-ink" />
              {t.badge}
            </span>
          </span>
        }
        icon={<CardIcon><Radio /></CardIcon>}
        action={
          board.canConfigure ? (
            <Button type="button" variant="ghost" size="sm" className="text-ink-3" onClick={() => setConfirmOff(true)}>
              {t.turnOff}
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div aria-live="polite">
          {board.live.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-3">{t.none}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {board.live.map((e) => {
                const name = fullName(e);
                const p = progress(e);
                return (
                  <li key={e.session_id} className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-center sm:gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <Avatar name={name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink">
                          {name}
                          {e.workout_label && <span className="font-normal text-ink-3"> · {e.workout_label}</span>}
                        </p>
                        <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                          <span className="tabular">{t.progress(p.done, p.total)}</span>
                          <span aria-hidden>·</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock aria-hidden className="size-3" />
                            {t.elapsed(durationLabel(e.started_at, nowMs))}
                          </span>
                        </p>
                        <ProgressBar value={p.done} max={p.total} label={`${name}: ${t.progress(p.done, p.total)}`} className="mt-1.5 h-1.5" />
                      </div>
                    </div>
                    <Button asChild variant="outline" size="sm" className="shrink-0 self-start sm:self-center">
                      <Link href={chatHref(e.student_id)} aria-label={t.sendMessageTo(name)}>
                        <MessageCircle aria-hidden />
                        {t.sendMessage}
                      </Link>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <section aria-labelledby="live-attention" className="flex flex-col gap-2">
          <h3 id="live-attention" className="text-[13px] font-semibold text-ink">
            {t.attentionTitle}
          </h3>
          {board.attention.length === 0 ? (
            <p className="text-[13px] text-ink-3">{t.attentionNone}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {board.attention.map((a) => (
                <AttentionRow key={`${a.kind}:${a.student_id}`} entry={a} nowMs={nowMs} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="mt-4 text-xs text-ink-3">{t.stateNote}</p>

      <ConfirmDialog
        open={confirmOff}
        onOpenChange={setConfirmOff}
        title={t.turnOff}
        description={t.turnOffConfirm}
        confirmLabel={t.turnOff}
        pending={pending}
        onConfirm={() => setEnabled(false)}
      />
    </Card>
  );
}

function AttentionRow({ entry, nowMs }: { entry: AttentionEntry; nowMs: number }) {
  const warn = entry.kind === "pain" || entry.kind === "session_alert";
  const Icon = warn ? AlertTriangle : entry.kind === "stalled" ? PauseCircle : MessageCircle;
  return (
    <li>
      <Link
        href={attentionHref(entry)}
        className={cn(
          "flex items-start gap-2 rounded-lg px-2.5 py-2 text-[13px] ring-1 outline-none focus-visible:ring-2 focus-visible:ring-ring",
          warn ? "bg-warning-soft text-warning-ink ring-warning-line" : "bg-canvas text-ink ring-line hover:bg-surface",
        )}
      >
        <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate font-medium">{fullName(entry)}</span>
          <span className={cn("block", warn ? "" : "text-ink-2")}>{attentionLabel(entry, nowMs)}</span>
        </span>
      </Link>
    </li>
  );
}
