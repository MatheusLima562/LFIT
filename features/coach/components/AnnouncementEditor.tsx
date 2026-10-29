"use client";

import { useRouter } from "next/navigation";
import { Megaphone } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/db/client";
import { formatDate } from "@/lib/format";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { COACH_TEXT_MAX, coachTextSchema } from "../schemas";
import type { StaffAnnouncement } from "../queries";

const t = messages.coach.announcement;

/**
 * Recado do professor para um aluno (`studentId`) ou para todos os seus alunos (`studentId` nulo). Publica e encerra do
 * navegador direto para as RPCs (o texto nunca passa por server action, toast ou console). Só o autor encerra.
 */
export function AnnouncementEditor({ studentId, current, compact = false }: { studentId: string | null; current: StaffAnnouncement | null; compact?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const id = useId();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"publish" | "end" | null>(null);
  const valid = coachTextSchema.safeParse(draft).success;

  const publish = async () => {
    if (!valid) return;
    setBusy("publish");
    try {
      const { error } = await supabase.rpc("set_trainer_announcement", { p_body: draft.trim(), ...(studentId ? { p_student_id: studentId } : {}) });
      if (error) return void toast.error(dbErrorMessage(error));
      setDraft("");
      toast.success(t.published);
      router.refresh();
    } catch {
      toast.error(t.failed);
    } finally {
      setBusy(null);
    }
  };

  const end = async () => {
    if (!current) return;
    setBusy("end");
    try {
      const { error } = await supabase.rpc("end_trainer_announcement", { p_announcement_id: current.id });
      if (error) return void toast.error(dbErrorMessage(error));
      toast.success(t.ended);
      router.refresh();
    } catch {
      toast.error(t.failed);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {!compact && (
        <div>
          <h2 id={`${id}-title`} className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Megaphone aria-hidden className="size-4 text-ink-3" />
            {studentId ? t.title : t.titleAll}
          </h2>
          <p className="mt-0.5 text-xs text-ink-3">{studentId ? t.hint : t.hintAll}</p>
        </div>
      )}

      {current ? (
        <div className="rounded-xl bg-canvas p-3 ring-1 ring-line">
          <p className="text-xs font-medium text-ink-3">{t.current}</p>
          <p className="mt-1 text-sm break-words whitespace-pre-wrap text-ink">{current.body}</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-ink-3">{current.mine ? t.expires(formatDate(current.expiresAt)) : t.byOther}</span>
            {current.mine && (
              <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => void end()}>
                {busy === "end" ? t.ending : t.end}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-3">{t.none}</p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-body`} className="text-sm font-medium text-ink">
          {t.label}
        </label>
        <Textarea
          id={`${id}-body`}
          value={draft}
          maxLength={COACH_TEXT_MAX}
          rows={3}
          placeholder={t.placeholder}
          aria-describedby={`${id}-count`}
          onChange={(e) => setDraft(e.target.value)}
          className="text-base md:text-sm"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-ink-3">{current ? t.replaces : null}</span>
          <span id={`${id}-count`} className="text-[11px] text-ink-3 tabular-nums">
            {messages.coach.counter(draft.length, COACH_TEXT_MAX)}
          </span>
        </div>
        <Button type="button" className="self-start" disabled={!valid || busy !== null} onClick={() => void publish()}>
          {busy === "publish" ? t.publishing : t.publish}
        </Button>
      </div>
    </div>
  );
}
