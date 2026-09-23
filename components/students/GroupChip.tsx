import { cn } from "@/lib/utils";

/** Grupo especial (ex.: "Dor na Coluna"). A cor do grupo vai só no marcador; o texto usa tinta neutra. */
export function GroupChip({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md bg-canvas px-1.5 py-0.5 text-xs font-medium text-ink-2 ring-1 ring-line",
        className,
      )}
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate">{name}</span>
    </span>
  );
}
