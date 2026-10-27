"use client";

import { Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { messages } from "@/messages/pt-BR";

const t = messages.aluno.run;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Descanso entre séries: barra fixa acima da navegação; vibra ao terminar (quando o aparelho permite). */
export function RestTimer({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [endsAt] = useState(() => Date.now() + seconds * 1000);
  const [now, setNow] = useState(() => Date.now());
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (left > 0) return;
    try {
      navigator.vibrate?.(300);
    } catch {
      // Sem vibração no aparelho: segue.
    }
    const id = window.setTimeout(onDone, 1200);
    return () => window.clearTimeout(id);
  }, [left, onDone]);

  return (
    <div
      role="timer"
      aria-live="polite"
      className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-surface/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm text-ink-2">
          <Timer aria-hidden className="size-4 text-ink-3" />
          {left > 0 ? t.rest : t.restDone}
        </span>
        <span className="text-2xl font-semibold text-ink tabular-nums">{mmss(left)}</span>
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          {t.skipRest}
        </Button>
      </div>
    </div>
  );
}
