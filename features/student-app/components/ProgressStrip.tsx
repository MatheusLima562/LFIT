"use client";

import { Check } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { currentExercise, type RunState } from "../session-state";
import type { AppItem } from "../types";

const t = messages.aluno.run;

/** Lista de progresso (rola na horizontal): ✓ nos concluídos, o atual em destaque; toque volta a qualquer exercício. */
export function ProgressStrip({ items, run, currentId, onSelect }: { items: AppItem[]; run: RunState; currentId: string | null; onSelect: (id: string) => void }) {
  const listRef = useRef<HTMLOListElement>(null);

  // Mantém o exercício atual à vista na faixa.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>("[aria-current='step']")?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [currentId]);

  return (
    <nav aria-label={t.progress} className="-mx-4">
      <ol ref={listRef} className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {items.map((item, i) => {
          const done = Boolean(run[item.id]?.completed);
          const current = item.id === currentId;
          const name = currentExercise(item, run[item.id]).name;
          return (
            <li key={item.id} className="shrink-0">
              <button
                type="button"
                aria-current={current ? "step" : undefined}
                aria-label={t.goTo(i + 1, name, done)}
                onClick={() => onSelect(item.id)}
                className={cn(
                  "flex h-10 max-w-40 items-center gap-1.5 rounded-full px-3 text-[13px] ring-1 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  current ? "bg-ink text-surface ring-ink" : done ? "bg-surface text-ink-3 ring-line" : "bg-surface text-ink ring-line",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                    done ? "bg-success-soft text-success-ink" : current ? "bg-surface/20" : "bg-canvas",
                  )}
                >
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                <span className="truncate">{name}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
