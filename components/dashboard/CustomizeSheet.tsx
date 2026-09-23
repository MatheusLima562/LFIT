"use client";

import type { DashboardCardId } from "@/types/dashboard";
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
  subscribers: "Novos assinantes",
  topStudents: "Top 5 alunos",
  assessment: "Avaliação física",
  expiringAccess: "Acesso expirando",
  weeklyWorkouts: "Treinos da semana",
  sales: "Vendas",
};

interface CustomizeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hidden: Set<DashboardCardId>;
  onToggle: (id: DashboardCardId) => void;
  onReset: () => void;
}

export function CustomizeSheet({ open, onOpenChange, hidden, onToggle, onReset }: CustomizeSheetProps) {
  const ids = Object.keys(cardLabels) as DashboardCardId[];
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
