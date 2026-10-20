import { CheckCircle2, Dumbbell } from "lucide-react";
import type { CompletedWorkoutItem } from "@/types/dashboard";
import { formatNumber } from "@/lib/format";
import { Avatar } from "@/components/ui/Avatar";
import { Card, CardFooter, CardHeader, CardIcon } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

interface CompletedWorkoutsCardProps {
  /** Até 8 mais recentes de hoje (dia de São Paulo). */
  items: CompletedWorkoutItem[];
  /** Total de hoje (pode ser maior que a lista). */
  count: number;
  /** "2 na quarta passada" — mesmo dia da semana passada. */
  comparison: string;
}

/** Treinos concluídos hoje. Lido ao abrir a página (não é ao vivo). */
export function CompletedWorkoutsCard({ items, count, comparison }: CompletedWorkoutsCardProps) {
  return (
    <Card labelledBy="card-completed" className="h-full">
      <CardHeader
        id="card-completed"
        title="Treinos concluídos"
        icon={<CardIcon><CheckCircle2 /></CardIcon>}
        action={
          <span className="tabular shrink-0 rounded-full bg-canvas px-2 py-0.5 text-xs font-semibold text-ink ring-1 ring-line">
            {formatNumber(count)} hoje
          </span>
        }
      />
      {items.length === 0 ? (
        <EmptyState icon={<Dumbbell />} message="Nenhum treino concluído hoje." />
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2.5 py-2 first:pt-0">
              <Avatar name={item.studentName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-ink">{item.studentName}</p>
                <p className="truncate text-xs text-ink-3">{item.workoutName}</p>
              </div>
              <span className="tabular shrink-0 text-xs text-ink-3">{item.time}</span>
            </li>
          ))}
        </ul>
      )}
      <CardFooter>
        <p className="text-xs text-ink-3">
          {count > items.length && `Mostrando os ${items.length} mais recentes · `}
          {comparison}
        </p>
      </CardFooter>
    </Card>
  );
}
