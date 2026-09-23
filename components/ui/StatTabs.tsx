"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import type { StatTab } from "@/types/dashboard";
import { cn } from "@/lib/utils";
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

/** Abas com contador (Radix Tabs: setas, Home/End e ARIA prontos). */
export function StatTabs({ tabs, label, emptyIcon, maxItems = 3, defaultTabId }: StatTabsProps) {
  return (
    <TabsPrimitive.Root defaultValue={defaultTabId ?? tabs[0]?.id} className="flex flex-1 flex-col gap-3">
      <TabsPrimitive.List
        aria-label={label}
        className="grid gap-1 rounded-xl bg-canvas p-1"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab) => {
          const count = tab.items.length;
          return (
            <TabsPrimitive.Trigger
              key={tab.id}
              value={tab.id}
              className={cn(
                "group flex min-w-0 flex-col items-start gap-0.5 rounded-lg px-2 py-2 text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring/50",
                "hover:bg-surface/60 data-[state=active]:bg-surface data-[state=active]:shadow-card data-[state=active]:ring-1 data-[state=active]:ring-line",
              )}
            >
              <span
                className={cn(
                  "tabular text-xl leading-none font-semibold tracking-tight group-data-[state=active]:text-ink",
                  count > 0 ? "text-ink-2" : "text-ink-3",
                )}
              >
                {formatNumber(count)}
              </span>
              <span className="flex w-full min-w-0 items-center gap-1.5 text-[11px] font-medium text-ink-2">
                {tab.tone && count > 0 && <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", toneDot[tab.tone])} />}
                <span className="truncate">{tab.label}</span>
              </span>
            </TabsPrimitive.Trigger>
          );
        })}
      </TabsPrimitive.List>

      {tabs.map((tab) => {
        const visible = tab.items.slice(0, maxItems);
        const hidden = tab.items.length - visible.length;
        return (
          <TabsPrimitive.Content key={tab.id} value={tab.id} className="flex flex-1 flex-col outline-none">
            {tab.items.length === 0 ? (
              <EmptyState icon={emptyIcon} message={tab.emptyMessage} />
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {visible.map((item) => (
                  <li key={item.id} className="flex items-center gap-2.5 py-2 first:pt-0.5">
                    <Avatar name={item.name} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{item.name}</span>
                    {item.meta && <span className="shrink-0 text-xs text-ink-3">{item.meta}</span>}
                  </li>
                ))}
                {hidden > 0 && <li className="pt-2 text-xs font-medium text-ink-3">+ {plural(hidden, "aluno")} nesta lista</li>}
              </ul>
            )}
          </TabsPrimitive.Content>
        );
      })}
    </TabsPrimitive.Root>
  );
}
