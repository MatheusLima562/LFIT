"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dumbbell, History, MessageCircle, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useChatUnread } from "@/features/chat/hooks";
import { cn } from "@/lib/utils";
import { keyboardLikelyOpen } from "../humanize";
import { messages } from "@/messages/pt-BR";

const t = messages.aluno.nav;
const ITEMS = [
  { href: "/aluno", label: t.today, icon: Dumbbell, match: (p: string) => p === "/aluno" || p.startsWith("/aluno/treino") },
  { href: "/aluno/historico", label: t.history, icon: History, match: (p: string) => p.startsWith("/aluno/historico") },
  { href: "/aluno/chat", label: t.chat, icon: MessageCircle, match: (p: string) => p.startsWith("/aluno/chat") },
  { href: "/aluno/perfil", label: t.profile, icon: UserRound, match: (p: string) => p.startsWith("/aluno/perfil") },
];

const isEditable = (el: Element | null) =>
  el instanceof HTMLElement && (el.matches("input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea, select") || el.isContentEditable);

/**
 * Teclado virtual aberto: no iOS a barra fixa subiria colada ao teclado e cobriria o campo. Dois sinais: campo de texto
 * focado num aparelho de toque, ou a área visível (visualViewport) bem menor que a janela.
 */
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const touch = window.matchMedia("(pointer: coarse)");
    const vv = window.visualViewport;
    const update = () => {
      const typing = touch.matches && isEditable(document.activeElement);
      setOpen(typing || (vv ? keyboardLikelyOpen(vv.height, window.innerHeight) : false));
    };
    // focusout dispara antes de o foco chegar ao próximo campo: espera um quadro.
    const later = () => requestAnimationFrame(update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", later);
    vv?.addEventListener("resize", update);
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", later);
      vv?.removeEventListener("resize", update);
    };
  }, []);
  return open;
}

/** Barra inferior (alcance do polegar), fixa, respeitando a área segura do iPhone. Some com o teclado aberto. */
export function StudentNav({ studentId, initialUnread }: { studentId: string; initialUnread: number }) {
  const pathname = usePathname();
  const unread = useChatUnread({ initial: initialUnread, studentId });
  const keyboardOpen = useKeyboardOpen();
  if (keyboardOpen) return null;
  return (
    <nav
      aria-label={t.label}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-backdrop-filter:bg-surface/80"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
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
