import { CheckCircle2, Dumbbell } from "lucide-react";
import type { CompletedWorkoutItem } from "@/types/dashboard";
import { Avatar } from "@/components/ui/Avatar";
import { Card, CardHeader, CardIcon } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

function LiveBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] text-emerald-700 uppercase ring-1 ring-emerald-200">
      <span aria-hidden className="relative flex size-1.5">
        <span className="absolute inset-0 animate-live rounded-full bg-emerald-500" />
        <span className="relative size-1.5 rounded-full bg-emerald-500" />
      </span>
      Ao vivo
    </span>
  );
}

export function CompletedWorkoutsCard({ items }: { items: CompletedWorkoutItem[] }) {
  return (
    <Card labelledBy="card-completed" className="h-full">
      <CardHeader
        id="card-completed"
        title="Treinos concluídos"
        icon={<CardIcon><CheckCircle2 /></CardIcon>}
        action={<LiveBadge />}
      />
      {items.length === 0 ? (
        <EmptyState icon={<Dumbbell />} message="Nenhum treino concluído ainda." />
      ) : (
        <ul aria-live="polite" className="flex flex-col divide-y divide-line">
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
    </Card>
  );
}
