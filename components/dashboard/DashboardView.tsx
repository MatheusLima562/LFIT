"use client";

import { CheckCircle2 } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { quickActions } from "@/data/quick-actions";
import type { Banner, DashboardCardId, SearchableStudent } from "@/types/dashboard";
import { cn } from "@/lib/cn";
import { CustomizeDialog } from "./CustomizeDialog";
import { DashboardBanner } from "./DashboardBanner";
import { DashboardHeader } from "./DashboardHeader";
import { QuickActionDialog } from "./QuickActionDialog";
import { QuickActions } from "./QuickActions";

/**
 * Posição de cada card no grid.
 * Mobile: 1 coluna · Tablet: 2 colunas · Desktop largo: 12 colunas.
 * `grid-flow-row-dense` preenche buracos quando o usuário oculta cards.
 */
const layout: Record<Exclude<DashboardCardId, "overview">, string> = {
  tracking: "xl:col-span-4 xl:row-span-2",
  satisfaction: "xl:col-span-4 xl:row-span-2",
  completed: "xl:col-span-4",
  plan: "xl:col-span-4",
  subscribers: "xl:col-span-4",
  topStudents: "xl:col-span-4",
  assessment: "xl:col-span-4",
  expiringAccess: "xl:col-span-4",
  weeklyWorkouts: "md:col-span-2 xl:col-span-8",
  sales: "md:col-span-2 xl:col-span-12",
};

const gridOrder = Object.keys(layout) as (keyof typeof layout)[];

interface DashboardViewProps {
  firstName: string;
  students: SearchableStudent[];
  banner: Banner;
  cards: Record<DashboardCardId, ReactNode>;
}

export function DashboardView({ firstName, students, banner, cards }: DashboardViewProps) {
  const [hidden, setHidden] = useState<Set<DashboardCardId>>(() => new Set());
  const [bannerVisible, setBannerVisible] = useState(true);
  const [customizing, setCustomizing] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const activeAction = quickActions.find((a) => a.id === actionId) ?? null;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const toggleCard = useCallback((id: DashboardCardId) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const visibleCards = gridOrder.filter((id) => !hidden.has(id));

  return (
    <>
      <DashboardHeader
        firstName={firstName}
        students={students}
        onCustomize={() => setCustomizing(true)}
        onAction={setActionId}
      />

      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        {bannerVisible && <DashboardBanner banner={banner} onDismiss={() => setBannerVisible(false)} />}

        <QuickActions onAction={setActionId} />

        {!hidden.has("overview") && cards.overview}

        {visibleCards.length > 0 ? (
          <div className="grid grid-flow-row-dense grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
            {visibleCards.map((id) => (
              <div key={id} className={cn("min-w-0", layout[id])}>
                {cards[id]}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
            <p className="text-sm text-ink-2">Todos os indicadores estão ocultos.</p>
            <button
              type="button"
              onClick={() => setHidden(new Set())}
              className="mt-2 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              Mostrar tudo novamente
            </button>
          </div>
        )}
      </div>

      <CustomizeDialog
        open={customizing}
        onClose={() => setCustomizing(false)}
        hidden={hidden}
        onToggle={toggleCard}
        onReset={() => setHidden(new Set())}
      />

      <QuickActionDialog
        action={activeAction}
        onClose={() => setActionId(null)}
        onDone={(message) => {
          setActionId(null);
          setToast(message);
        }}
      />

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
        {toast && (
          <p className="pointer-events-auto flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-pop transition duration-200 starting:translate-y-2 starting:opacity-0">
            <CheckCircle2 aria-hidden className="size-4 text-emerald-400" />
            {toast}
          </p>
        )}
      </div>
    </>
  );
}
