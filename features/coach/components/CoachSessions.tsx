"use client";

import { useRouter } from "next/navigation";
import { MessageSquareReply } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/db/client";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { COACH_TEXT_MAX, coachTextSchema } from "../schemas";
import type { CoachSession } from "../queries";

const t = messages.coach.sessions;

/** Uma sessão: comentário do aluno e a resposta (do navegador direto para `reply_to_session`, que confere a saúde). */
function SessionRow({ session }: { session: CoachSession }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(session.coachReply ?? "");
  const [busy, setBusy] = useState(false);
  const valid = coachTextSchema.safeParse(draft).success;
  const nearLimit = COACH_TEXT_MAX - draft.length <= 20;

  const send = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("reply_to_session", { p_session_id: session.id, p_reply: draft.trim() });
      if (error?.message === "SESSION_NOT_FOUND") {
        // Perdeu o acesso à saúde com a caixa aberta (a RPC confere no servidor): avisa e recarrega sem a caixa.
        toast.error(t.lostAccess);
        setOpen(false);
        router.refresh();
        return;
      }
      if (error) return void toast.error(dbErrorMessage(error));
      toast.success(t.sent);
      setOpen(false);
      router.refresh();
    } catch {
      toast.error(t.failed);
    } finally {
      setBusy(false);
    }
  };

  const workout = session.workoutName ? `${session.workoutLabel} · ${session.workoutName}` : session.workoutLabel;
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="text-sm font-medium text-ink">
          {formatDate(session.startedAt)} · {t.workout(workout)}
        </p>
        {session.rpe !== null && <span className="text-xs text-ink-2">{t.rpe(session.rpe)}</span>}
      </div>
      <p className="text-sm break-words whitespace-pre-wrap text-ink-2">
        <span className="sr-only">{t.comment}: </span>
        {session.feedbackNote ?? <span className="text-ink-3">{t.noComment}</span>}
      </p>
      {session.coachReply && !open && (
        <p className="rounded-lg bg-canvas px-3 py-2 text-sm break-words whitespace-pre-wrap text-ink ring-1 ring-line">
          <span className="font-medium">{t.yourReply}: </span>
          {session.coachReply}
        </p>
      )}
      {open ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-reply`} className="text-sm font-medium text-ink">
            {t.replyLabel}
          </label>
          <Textarea
            id={`${id}-reply`}
            value={draft}
            maxLength={COACH_TEXT_MAX}
            rows={2}
            aria-describedby={`${id}-count`}
            onChange={(e) => setDraft(e.target.value)}
            className="text-base md:text-sm"
          />
          <span id={`${id}-count`} className={cn("self-end text-[11px] tabular-nums", nearLimit ? "text-warning-ink" : "text-ink-3")}>
            {messages.coach.counter(draft.length, COACH_TEXT_MAX)}
          </span>
          <span aria-live="polite" className="sr-only">
            {nearLimit ? t.nearLimit(COACH_TEXT_MAX - draft.length) : ""}
          </span>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={!valid || busy} onClick={() => void send()}>
              {busy ? t.sending : t.send}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              {t.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setOpen(true)}>
          <MessageSquareReply aria-hidden />
          {session.coachReply ? t.editReply : t.reply}
        </Button>
      )}
    </li>
  );
}

/** "Sessões recentes": só renderizada para quem vê a saúde do aluno (a RPC confere de novo). */
export function CoachSessions({ sessions }: { sessions: CoachSession[] }) {
  if (sessions.length === 0) return <p className="text-sm text-ink-3">{t.empty}</p>;
  return (
    <ul aria-label={t.title} className="flex flex-col divide-y divide-line">
      {sessions.map((s) => (
        <SessionRow key={s.id} session={s} />
      ))}
    </ul>
  );
}
