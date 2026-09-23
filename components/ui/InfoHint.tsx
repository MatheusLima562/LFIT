import { Info } from "lucide-react";
import { Tooltip } from "./Tooltip";

/** Ícone de ajuda com tooltip, acessível por teclado. */
export function InfoHint({ content, side = "top" }: { content: string; side?: "top" | "bottom" }) {
  return (
    <Tooltip content={content} side={side}>
      <button
        type="button"
        aria-label={content}
        className="grid size-6 place-items-center rounded-md text-ink-3 outline-none transition-colors hover:bg-canvas hover:text-ink-2 focus-visible:ring-2 focus-visible:ring-brand-500/40"
      >
        <Info aria-hidden className="size-3.5" />
      </button>
    </Tooltip>
  );
}
