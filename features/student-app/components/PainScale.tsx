"use client";

import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { PAIN_ALERT_ABOVE } from "../format";

const t = messages.aluno.pain;

/** Escala de dor 0–10 (botões grandes para o polegar). Dado de saúde: nunca vai para URL ou log. */
export function PainScale({ id, value, onChange }: { id: string; value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="grid grid-cols-6 gap-1.5 sm:grid-cols-11">
        {Array.from({ length: 11 }, (_, n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={t.scale(n)}
              onClick={() => onChange(n)}
              className={cn(
                "h-11 rounded-lg text-[15px] font-semibold tabular-nums ring-1 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "bg-ink text-surface ring-ink" : "bg-surface text-ink ring-line hover:bg-canvas",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-ink-3">{t.guide}</p>
      {value !== null && value > PAIN_ALERT_ABOVE && (
        <p role="status" className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-[13px] text-warning-ink">
          {t.high}
        </p>
      )}
    </div>
  );
}
