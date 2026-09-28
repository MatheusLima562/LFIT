"use client";

import type { DashboardCardId } from "@/types/dashboard";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";

export const cardLabels: Record<DashboardCardId, string> = {
  overview: "Visão geral",
  tracking: "Acompanhamento de alunos",
  satisfaction: "Satisfação dos alunos",
  completed: "Treinos concluídos",
  plan: "Plano",
  subscribers: "Novos alunos",
  topStudents: "Top 5 alunos",
  assessment: "Avaliação física",
  expiringAccess: "Acesso expirando",
  weeklyWorkouts: "Treinos da semana",
  sales: "Vendas",
};

interface SoonIndicator {
  id: string;
  label: string;
  /** Quando o indicador passa a existir (mostrado embaixo do nome). */
  reason: string;
}

/**
 * Indicadores ainda sem dados reais (regra: nunca exibir número de exemplo como se fosse real —
 * ver `EXAMPLE_ONLY_METRICS` em lib/dashboard.ts e o comentário em app/(app)/page.tsx). Aparecem aqui
 * desabilitados, com a data/condição para ficarem disponíveis, mas nunca no grid do Início.
 */
export const SOON_INDICATORS: SoonIndicator[] = [
  { id: "retencao", label: "Retenção", reason: "Quando o dashboard usar dados reais de alunos (etapa 1.6)." },
  { id: "engajamento", label: "Engajamento semanal", reason: "Quando o dashboard usar dados reais de alunos (etapa 1.6)." },
  { id: "treinos-30", label: "Treinos registrados", reason: "Quando os alunos registrarem treinos no app (Fase 3)." },
  { id: "completed", label: cardLabels.completed, reason: "Quando os alunos registrarem treinos no app (Fase 3)." },
  { id: "topStudents", label: cardLabels.topStudents, reason: "Quando os alunos registrarem treinos no app (Fase 3)." },
  { id: "satisfaction", label: cardLabels.satisfaction, reason: "Quando os alunos avaliarem os treinos no app (Fase 3)." },
  { id: "assessment", label: cardLabels.assessment, reason: "Quando o módulo de Avaliação existir." },
];

interface CustomizeSheetProps {
  /** Só os cards disponíveis (os escondidos até a 1.6/Fase 3 não aparecem aqui). */
  ids: DashboardCardId[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hidden: Set<DashboardCardId>;
  onToggle: (id: DashboardCardId) => void;
  onReset: () => void;
}

export function CustomizeSheet({ ids, open, onOpenChange, hidden, onToggle, onReset }: CustomizeSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="gap-0 sm:max-w-sm">
        <SheetHeader className="border-b border-line">
          <SheetTitle>Personalizar dashboard</SheetTitle>
          <SheetDescription>Escolha quais indicadores aparecem no seu início.</SheetDescription>
        </SheetHeader>
        <ul className="flex-1 divide-y divide-line overflow-y-auto px-4">
          {ids.map((id) => (
            <li key={id} className="flex items-center justify-between gap-4 py-3">
              <Label htmlFor={`card-${id}`} className="font-normal">
                {cardLabels[id]}
              </Label>
              <Switch id={`card-${id}`} checked={!hidden.has(id)} onCheckedChange={() => onToggle(id)} />
            </li>
          ))}

          {SOON_INDICATORS.length > 0 && (
            <li className="pt-4 pb-1 text-xs font-medium tracking-wide text-ink-3 uppercase" aria-hidden>
              Em breve
            </li>
          )}
          {SOON_INDICATORS.map((item) => (
            <li key={item.id} className="py-3">
              <div className="flex flex-col gap-0.5 opacity-70" aria-disabled="true">
                <span className="flex items-center justify-between gap-4">
                  <span className="text-sm text-ink-2">{item.label}</span>
                  <span className="shrink-0 rounded-md bg-canvas px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-ink-3 uppercase ring-1 ring-line">
                    {messages.app.soon}
                  </span>
                </span>
                <span className="text-xs text-ink-3">{item.reason}</span>
              </div>
            </li>
          ))}
        </ul>
        <SheetFooter className="flex-row justify-between border-t border-line">
          <Button variant="ghost" onClick={onReset}>
            Restaurar padrão
          </Button>
          <Button onClick={() => onOpenChange(false)}>Concluir</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
