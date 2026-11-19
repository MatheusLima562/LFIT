"use client";

import { useRouter } from "next/navigation";
import { EyeOff, HeartHandshake } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createClient } from "@/lib/db/client";
import { cn } from "@/lib/utils";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { NPS_SCORES } from "../nps";

const t = messages.nps.prompt;

/**
 * Cartão "Como está sendo treinar com {nome}?" na Hoje do aluno: só a nota 0–10 (sem comentário). Aparece sozinho
 * quando o aluno está apto; o banco confere critérios e intervalo. "Agora não" esconde pelo prazo de
 * `private.nps_settings`. A equipe vê só o resultado agrupado. Nota do navegador direto para `submit_nps`.
 */
export function NpsPromptCard({ trainerFirstName, intervalDays, reminded }: { trainerFirstName: string | null; intervalDays: number; reminded: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const id = useId();
  const [score, setScore] = useState<number | null>(null);
  const [busy, setBusy] = useState<"send" | "later" | null>(null);
  const [done, setDone] = useState<"sent" | "later" | null>(null);
  // A nota não pode ser editada depois: confirmar antes ("Enviar nota X?").
  const [confirming, setConfirming] = useState(false);

  const send = async () => {
    if (score === null) return;
    setConfirming(false);
    setBusy("send");
    try {
      const { error } = await supabase.rpc("submit_nps", { p_score: score });
      if (error) {
        toast.error(dbErrorMessage(error));
        if (error.message === "NPS_NOT_ELIGIBLE") setDone("later");
        return;
      }
      setDone("sent");
      router.refresh();
    } catch {
      toast.error(t.failed);
    } finally {
      setBusy(null);
    }
  };

  const later = async () => {
    setBusy("later");
    try {
      const { error } = await supabase.rpc("snooze_nps_prompt");
      if (error) return void toast.error(dbErrorMessage(error));
      setDone("later");
      toast(t.later);
    } catch {
      toast.error(t.failed);
    } finally {
      setBusy(null);
    }
  };

  if (done === "later") return null;
  if (done === "sent") {
    return (
      <p role="status" className="rounded-2xl bg-success-soft p-4 text-sm font-medium text-success-ink ring-1 ring-success-line">
        {t.thanks}
      </p>
    );
  }

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-canvas text-ink-2 ring-1 ring-line">
          <HeartHandshake className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-[15px] font-semibold text-ink">
            {t.title(trainerFirstName)}
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-2">{t.question}</p>
          {reminded && <p className="mt-1 text-[13px] font-medium text-ink">{t.reminder}</p>}
        </div>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="sr-only">{t.scaleLabel}</legend>
        <div className="grid grid-cols-6 gap-1.5">
          {NPS_SCORES.map((n) => (
            <label
              key={n}
              className={cn(
                "grid h-11 cursor-pointer place-items-center rounded-lg text-base font-semibold tabular-nums ring-1 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50",
                score === n ? "bg-selected-soft text-ink ring-selected-line" : "bg-canvas text-ink-2 ring-line hover:text-ink",
              )}
            >
              <input type="radio" name={`${id}-score`} value={n} checked={score === n} onChange={() => setScore(n)} className="sr-only" aria-label={t.scoreOption(n)} />
              <span aria-hidden>{n}</span>
            </label>
          ))}
        </div>
        <div aria-hidden className="flex justify-between text-[11px] text-ink-3">
          <span>0 · {t.low}</span>
          <span>10 · {t.high}</span>
        </div>
      </fieldset>

      <p className="flex gap-2 rounded-xl bg-info-soft p-3 text-xs text-info-ink ring-1 ring-info-line">
        <EyeOff aria-hidden className="mt-px size-4 shrink-0" />
        <span>{t.privacy}</span>
      </p>

      <div className="flex flex-col gap-2">
        <Button type="button" size="lg" className="h-12 w-full text-base" disabled={score === null || busy !== null} onClick={() => setConfirming(true)}>
          {busy === "send" ? t.sending : t.send}
        </Button>
        <Button type="button" variant="ghost" className="h-11 w-full" disabled={busy !== null} onClick={() => void later()}>
          {t.notNow}
        </Button>
      </div>
      {score !== null && (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={t.confirmTitle(score)}
          description={t.confirmText(intervalDays)}
          confirmLabel={t.confirmSend(score)}
          cancelLabel={t.confirmBack}
          pending={busy !== null}
          onConfirm={() => void send()}
        />
      )}
    </section>
  );
}
