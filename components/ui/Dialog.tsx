"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Placement = "center" | "right" | "left";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Título acessível; renderizado quando `title` é informado e `hideHeader` é falso. */
  title: string;
  description?: string;
  placement?: Placement;
  hideHeader?: boolean;
  children: ReactNode;
  className?: string;
}

const placements: Record<Placement, string> = {
  center:
    "m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl starting:open:translate-y-2 starting:open:scale-[0.98]",
  right:
    "ml-auto mr-0 h-dvh max-h-dvh w-full max-w-sm rounded-l-2xl starting:open:translate-x-8",
  left: "mr-auto ml-0 h-dvh max-h-dvh w-[18rem] max-w-[85vw] starting:open:-translate-x-8",
};

/**
 * Wrapper sobre o <dialog> nativo: foco preso, Esc e camada de topo vêm do navegador.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  placement = "center",
  hideHeader,
  children,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={hideHeader ? title : undefined}
      aria-labelledby={hideHeader ? undefined : titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "bg-surface p-0 text-ink shadow-pop outline-none",
        "opacity-100 transition-all duration-200 transition-discrete starting:open:opacity-0",
        "backdrop:bg-ink/30 backdrop:backdrop-blur-[2px]",
        placements[placement],
        className,
      )}
    >
      {open && (
        <div className="flex h-full flex-col">
          {!hideHeader && (
            <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div>
                <h2 id={titleId} className="text-base font-semibold tracking-tight">
                  {title}
                </h2>
                {description && <p className="mt-0.5 text-[13px] text-ink-2">{description}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="-mr-1.5 grid size-8 shrink-0 place-items-center rounded-lg text-ink-3 outline-none transition-colors hover:bg-canvas hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-500/40"
              >
                <X className="size-4" aria-hidden />
              </button>
            </header>
          )}
          {children}
        </div>
      )}
    </dialog>
  );
}
