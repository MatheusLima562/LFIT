import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface TooltipProps {
  content: string;
  children: ReactNode;
  side?: "top" | "right" | "bottom";
  className?: string;
}

const positions = {
  top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
  right: "left-full top-1/2 ml-3 -translate-y-1/2",
};

/**
 * Tooltip leve em CSS: aparece no hover e no foco do conteúdo.
 * O texto também deve estar disponível ao leitor de tela pelo próprio gatilho.
 */
export function Tooltip({ content, children, side = "top", className }: TooltipProps) {
  return (
    <span className={cn("group/tip relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 w-max max-w-56 rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium leading-snug text-white opacity-0 shadow-pop transition-opacity duration-150",
          "group-hover/tip:opacity-100 group-has-[:focus-visible]/tip:opacity-100",
          positions[side],
        )}
      >
        {content}
      </span>
    </span>
  );
}
