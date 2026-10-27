"use client";

import { Star } from "lucide-react";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/db/client";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";

const t = messages.aluno.done;

/**
 * Nota de 1 a 5 para o treino (opcional). Vai do navegador direto para `rate_workout_session` (só o aluno dono, só
 * sessão concluída); a nota nunca entra em URL, toast de erro ou console. Pode trocar a nota quantas vezes quiser.
 */
export function SessionRating({ sessionId, initial }: { sessionId: string; initial: number | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [value, setValue] = useState<number | null>(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  const rate = async (n: number) => {
    const previous = value;
    setValue(n);
    setState("saving");
    const { error } = await supabase.rpc("rate_workout_session", { p_session_id: sessionId, p_rating: n });
    if (error) {
      setValue(previous);
      setState("failed");
    } else {
      setState("saved");
    }
  };

  return (
    <section aria-labelledby="rating-title" className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <h2 id="rating-title" className="text-[15px] font-semibold text-ink">
        {t.ratingTitle}
      </h2>
      <p className="mt-0.5 text-xs text-ink-3">{t.ratingHint}</p>
      <div role="radiogroup" aria-label={t.ratingLabel} className="mt-3 flex justify-between gap-1">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value !== null && n <= value;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={t.ratingOption(n)}
              disabled={state === "saving"}
              onClick={() => void rate(n)}
              className="grid size-12 place-items-center rounded-xl outline-none hover:bg-canvas focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
            >
              <Star aria-hidden className={cn("size-7", on ? "fill-control text-control" : "text-ink-3")} />
            </button>
          );
        })}
      </div>
      <p role="status" className="mt-2 min-h-5 text-[13px] text-ink-2">
        {state === "saved" ? t.ratingSaved : state === "failed" ? t.ratingFailed : null}
      </p>
    </section>
  );
}
