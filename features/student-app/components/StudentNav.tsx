"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dumbbell, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";

const t = messages.aluno.nav;
const ITEMS = [
  { href: "/aluno", label: t.today, icon: Dumbbell, match: (p: string) => p === "/aluno" || p.startsWith("/aluno/treino") },
  { href: "/aluno/historico", label: t.history, icon: History, match: (p: string) => p.startsWith("/aluno/historico") },
];

/** Barra inferior (alcance do polegar), fixa, respeitando a área segura do iPhone. */
export function StudentNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label={t.label}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-backdrop-filter:bg-surface/80"
    >
      <ul className="mx-auto grid max-w-md grid-cols-2">
        {ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium outline-none focus-visible:bg-canvas",
                  active ? "text-ink" : "text-ink-3",
                )}
              >
                <Icon aria-hidden className={cn("size-5", active && "text-primary")} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
