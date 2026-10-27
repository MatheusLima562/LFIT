"use client";

import { ChevronsUpDown, LogOut, Settings } from "lucide-react";
import { useTransition } from "react";
import { signOut } from "@/features/auth/actions";
import type { ShellUser } from "@/types/dashboard";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { Avatar } from "@/components/ui/Avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const t = messages.userMenu;

/** Menu da conta. `compact` mostra só o avatar (sidebar recolhida / topo mobile). */
export function UserMenu({ user, compact }: { user: ShellUser; compact?: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t.label}
        className={cn(
          "flex min-w-0 items-center gap-2.5 rounded-xl text-left outline-none transition-colors hover:bg-canvas focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-canvas",
          compact ? "p-1" : "flex-1 p-1.5",
        )}
      >
        <Avatar name={user.fullName} size="lg" />
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-ink">{user.fullName}</span>
              <span className="block truncate text-xs text-ink-3">{user.roleLabel}</span>
            </span>
            <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-ink-3" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={compact ? "right" : "top"} align="start" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-semibold text-ink">{user.fullName}</span>
          <span className="block truncate text-xs text-ink-3">
            {user.roleLabel} · {user.organizationName}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <Settings aria-hidden />
          {t.settings}
          <span className="ml-auto text-[10px] font-semibold tracking-wide text-ink-3 uppercase">{messages.app.soon}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={pending} onSelect={() => startTransition(() => signOut())}>
          <LogOut aria-hidden />
          {t.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
