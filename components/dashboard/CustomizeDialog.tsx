"use client";

import type { DashboardCardId } from "@/types/dashboard";
import { buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/Dialog";
import { Switch } from "@/components/ui/Switch";

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

interface CustomizeDialogProps {
  open: boolean;
  onClose: () => void;
  hidden: Set<DashboardCardId>;
  onToggle: (id: DashboardCardId) => void;
  onReset: () => void;
}

export function CustomizeDialog({ open, onClose, hidden, onToggle, onReset }: CustomizeDialogProps) {
  const ids = Object.keys(cardLabels) as DashboardCardId[];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      placement="right"
      title="Personalizar dashboard"
      description="Escolha quais indicadores aparecem no seu início."
    >
      <ul className="flex-1 divide-y divide-line overflow-y-auto px-5">
        {ids.map((id) => (
          <li key={id} className="flex items-center justify-between gap-4 py-3">
            <span className="text-sm text-ink">{cardLabels[id]}</span>
            <Switch checked={!hidden.has(id)} onChange={() => onToggle(id)} label={`Mostrar ${cardLabels[id]}`} />
          </li>
        ))}
      </ul>
      <footer className="flex items-center justify-between gap-2 border-t border-line px-5 py-4">
        <button type="button" onClick={onReset} className={buttonClass("ghost", "md")}>
          Restaurar padrão
        </button>
        <button type="button" onClick={onClose} className={buttonClass("primary", "md")}>
          Concluir
        </button>
      </footer>
    </Dialog>
  );
}
