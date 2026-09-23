import Link from "next/link";
import { quickActions } from "@/data/quick-actions";

/** Atalhos para ações disponíveis. Sem nenhuma disponível, não renderiza (nada de botões mortos). */
export function QuickActions() {
  const available = quickActions.filter((a) => a.status === "available" && a.href);
  if (available.length === 0) return null;
  return (
    <nav aria-label="Ações rápidas" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
        {available.map((action) => {
          const Icon = action.icon;
          return (
            <li key={action.id}>
              <Link
                href={action.href!}
                className="group inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-surface pr-3.5 pl-1.5 text-[13px] font-medium text-ink-2 shadow-card outline-none transition-colors hover:border-brand-200 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span aria-hidden className="grid size-6 place-items-center rounded-lg bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-500 group-hover:text-white">
                  <Icon className="size-3.5" />
                </span>
                {action.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
