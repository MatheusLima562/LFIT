"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface MenuEntry {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
}

interface DropdownMenuProps {
  /** Conteúdo e classes do botão gatilho. */
  trigger: ReactNode;
  triggerClassName: string;
  triggerLabel?: string;
  heading?: string;
  items: MenuEntry[];
  onSelect: (id: string) => void;
  align?: "start" | "end";
}

export function DropdownMenu({
  trigger,
  triggerClassName,
  triggerLabel,
  heading,
  items,
  onSelect,
  align = "end",
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const focusItem = (index: number) => {
    const count = items.length;
    itemRefs.current[((index % count) + count) % count]?.focus();
  };

  const openAndFocus = (index: number) => {
    setOpen(true);
    requestAnimationFrame(() => focusItem(index));
  };

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openAndFocus(e.key === "ArrowDown" ? 0 : items.length - 1);
    }
  };

  const onMenuKeyDown = (e: KeyboardEvent) => {
    const current = itemRefs.current.indexOf(document.activeElement as HTMLButtonElement);
    const keys: Record<string, () => void> = {
      ArrowDown: () => focusItem(current + 1),
      ArrowUp: () => focusItem(current - 1),
      Home: () => focusItem(0),
      End: () => focusItem(items.length - 1),
      Escape: () => close(),
      Tab: () => close(false),
    };
    const handler = keys[e.key];
    if (!handler) return;
    if (e.key !== "Tab") e.preventDefault();
    handler();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel}
        onClick={() => (open ? close(false) : openAndFocus(0))}
        onKeyDown={onTriggerKeyDown}
        className={triggerClassName}
      >
        {trigger}
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          onKeyDown={onMenuKeyDown}
          className={cn(
            "absolute top-full z-40 mt-2 w-64 origin-top rounded-xl border border-line bg-surface p-1.5 shadow-pop",
            "transition duration-150 starting:scale-95 starting:opacity-0",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {heading && (
            <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">
              {heading}
            </p>
          )}
          {items.map((item, i) => (
            <button
              key={item.id}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close(false);
                onSelect(item.id);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left outline-none transition-colors hover:bg-canvas focus:bg-canvas"
            >
              {item.icon && (
                <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 [&_svg]:size-4">
                  {item.icon}
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-ink">{item.label}</span>
                {item.description && (
                  <span className="block truncate text-xs text-ink-3">{item.description}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
