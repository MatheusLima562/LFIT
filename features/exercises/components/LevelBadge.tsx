import { OctagonAlert, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import type { ContraindicationLevel } from "../constants";

const styles: Record<ContraindicationLevel, string> = {
  avoid: "bg-red-50 text-red-700 ring-red-200",
  caution: "bg-amber-50 text-amber-800 ring-amber-200",
};

/** Nível de contraindicação: sempre ícone + texto (nunca só cor). */
export function LevelBadge({ level, className, children }: { level: ContraindicationLevel; className?: string; children?: React.ReactNode }) {
  const Icon = level === "avoid" ? OctagonAlert : TriangleAlert;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", styles[level], className)}>
      <Icon aria-hidden className="size-3" />
      {children ?? messages.exercises.levels[level]}
    </span>
  );
}
