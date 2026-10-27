import { Ban, CircleCheck, CircleMinus, Clock } from "lucide-react";
import type { EffectiveStatus } from "@/features/students/queries";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";

const styles: Record<EffectiveStatus, { className: string; icon: typeof Clock }> = {
  active: { className: "bg-success-soft text-success-ink ring-success-line", icon: CircleCheck },
  blocked: { className: "bg-danger-soft text-danger-ink ring-danger-line", icon: Ban },
  inactive: { className: "bg-canvas text-ink-2 ring-line", icon: CircleMinus },
  expired: { className: "bg-warning-soft text-warning-ink ring-warning-line", icon: Clock },
};

/** Status efetivo do aluno. Sempre ícone + texto (nunca só cor). */
export function StatusBadge({ status, className }: { status: EffectiveStatus; className?: string }) {
  const { className: tone, icon: Icon } = styles[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1",
        tone,
        className,
      )}
    >
      <Icon aria-hidden className="size-3" />
      {messages.students.status[status]}
    </span>
  );
}
