"use client";

import { useCallback, useState, type ReactNode } from "react";
import type { Banner, DashboardCardId } from "@/types/dashboard";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CustomizeSheet } from "./CustomizeSheet";
import { DashboardBanner } from "./DashboardBanner";
import { DashboardHeader } from "./DashboardHeader";
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
  banner: Banner;
  cards: Record<DashboardCardId, ReactNode>;
}

export function DashboardView({ firstName, banner, cards }: DashboardViewProps) {
  const [hidden, setHidden] = useState<Set<DashboardCardId>>(() => new Set());
  const [bannerVisible, setBannerVisible] = useState(true);
  const [customizing, setCustomizing] = useState(false);

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
      <DashboardHeader firstName={firstName} onCustomize={() => setCustomizing(true)} />

      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        {bannerVisible && <DashboardBanner banner={banner} onDismiss={() => setBannerVisible(false)} />}

        {/* Ações ficam ocultas até existir ao menos uma disponível (etapa 1.3). */}
        <QuickActions onAction={() => {}} />

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
            <Button variant="link" onClick={() => setHidden(new Set())} className="mt-1 text-brand-700">
              Mostrar tudo novamente
            </Button>
          </div>
        )}
      </div>

      <CustomizeSheet
        open={customizing}
        onOpenChange={setCustomizing}
        hidden={hidden}
        onToggle={toggleCard}
        onReset={() => setHidden(new Set())}
      />
    </>
  );
}
