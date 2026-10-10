"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dumbbell, History, MessageCircle } from "lucide-react";
import { useChatUnread } from "@/features/chat/hooks";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";

const t = messages.aluno.nav;
const ITEMS = [
  { href: "/aluno", label: t.today, icon: Dumbbell, match: (p: string) => p === "/aluno" || p.startsWith("/aluno/treino") },
  { href: "/aluno/historico", label: t.history, icon: History, match: (p: string) => p.startsWith("/aluno/historico") },
  { href: "/aluno/chat", label: t.chat, icon: MessageCircle, match: (p: string) => p.startsWith("/aluno/chat") },
];

/** Barra inferior (alcance do polegar), fixa, respeitando a área segura do iPhone. */
export function StudentNav({ studentId, initialUnread }: { studentId: string; initialUnread: number }) {
  const pathname = usePathname();
  const unread = useChatUnread({ initial: initialUnread, studentId });
  return (
    <nav
      aria-label={t.label}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-backdrop-filter:bg-surface/80"
    >
      <ul className="mx-auto grid max-w-md grid-cols-3">
        {ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          // Na própria conversa as mensagens são marcadas como lidas: sem selo ali.
          const badge = href === "/aluno/chat" && !active ? unread : 0;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={badge ? `${label}, ${messages.chat.unread(badge)}` : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium outline-none focus-visible:bg-canvas",
                  active ? "text-ink" : "text-ink-3",
                )}
              >
                <span className="relative">
                  <Icon aria-hidden className={cn("size-5", active && "text-primary")} />
                  {badge > 0 && (
                    <span aria-hidden className="absolute -top-1.5 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-ink px-1 text-[10px] font-semibold text-surface">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
