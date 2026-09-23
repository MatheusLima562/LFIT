import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  icon: ReactNode;
  message: string;
  className?: string;
}

export function EmptyState({ icon, message, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-line-strong/70 bg-canvas/60 px-4 py-6 text-center",
        className,
      )}
    >
      <span aria-hidden className="grid size-9 place-items-center rounded-full bg-surface text-ink-3 shadow-card [&_svg]:size-[18px]">
        {icon}
      </span>
      <p className="max-w-[26ch] text-[13px] leading-snug text-ink-2">{message}</p>
    </div>
  );
}
