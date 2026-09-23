"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { StatTab } from "@/types/dashboard";
import { cn } from "@/lib/cn";
import { formatNumber, plural } from "@/lib/format";
import { Avatar } from "./Avatar";
import { EmptyState } from "./EmptyState";

interface StatTabsProps {
  tabs: StatTab[];
  label: string;
  emptyIcon: ReactNode;
  /** Quantos alunos listar antes de resumir em "+N". */
  maxItems?: number;
  defaultTabId?: string;
}

const toneDot: Record<NonNullable<StatTab["tone"]>, string> = {
  neutral: "bg-ink-3",
  warning: "bg-amber-400",
  danger: "bg-red-500",
};

export function StatTabs({ tabs, label, emptyIcon, maxItems = 3, defaultTabId }: StatTabsProps) {
  const [selectedId, setSelectedId] = useState(defaultTabId ?? tabs[0]?.id);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  const selected = tabs.find((t) => t.id === selectedId) ?? tabs[0];

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: tabs.length - 1,
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    const next = (moves[e.key] + tabs.length) % tabs.length;
    setSelectedId(tabs[next].id);
    tabRefs.current[next]?.focus();
  };

  const visible = selected.items.slice(0, maxItems);
  const hidden = selected.items.length - visible.length;

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div
        role="tablist"
        aria-label={label}
        className="grid gap-1 rounded-xl bg-canvas p-1"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab, i) => {
          const isSelected = tab.id === selected.id;
          const count = tab.items.length;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={isSelected}
              aria-controls={`${baseId}-panel`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => setSelectedId(tab.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "flex min-w-0 flex-col items-start gap-0.5 rounded-lg px-2 py-2 text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-brand-500/40",
                isSelected
                  ? "bg-surface shadow-card ring-1 ring-line"
                  : "hover:bg-surface/60",
              )}
            >
              <span
                className={cn(
                  "tabular text-xl leading-none font-semibold tracking-tight",
                  isSelected ? "text-ink" : count > 0 ? "text-ink-2" : "text-ink-3",
                )}
              >
                {formatNumber(count)}
              </span>
              <span className="flex w-full min-w-0 items-center gap-1.5 text-[11px] font-medium text-ink-2">
                {tab.tone && count > 0 && (
                  <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", toneDot[tab.tone])} />
                )}
                <span className="truncate">{tab.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${selected.id}`}
        className="flex flex-1 flex-col"
      >
        {selected.items.length === 0 ? (
          <EmptyState icon={emptyIcon} message={selected.emptyMessage} />
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {visible.map((item) => (
              <li key={item.id} className="flex items-center gap-2.5 py-2 first:pt-0.5">
                <Avatar name={item.name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{item.name}</span>
                {item.meta && <span className="shrink-0 text-xs text-ink-3">{item.meta}</span>}
              </li>
            ))}
            {hidden > 0 && (
              <li className="pt-2 text-xs font-medium text-ink-3">
                + {plural(hidden, "aluno")} nesta lista
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
