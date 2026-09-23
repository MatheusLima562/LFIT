"use client";

import { Menu } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { CurrentUser, PlanUsage } from "@/types/dashboard";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/Avatar";
import { Dialog } from "@/components/ui/Dialog";
import { Logo } from "./Logo";
import { Sidebar } from "./Sidebar";

interface AppShellProps {
  user: CurrentUser;
  plan: PlanUsage;
  children: ReactNode;
}

export function AppShell({ user, plan, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#conteudo"
        className="fixed top-2 left-2 z-[60] -translate-y-20 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white transition-transform focus:translate-y-0"
      >
        Pular para o conteúdo
      </a>

      {/* Desktop: sidebar fixa, recolhível */}
      <aside
        className={cn(
          "sticky top-0 z-30 hidden h-dvh shrink-0 border-r border-line transition-[width] duration-200 lg:flex",
          collapsed ? "w-[76px]" : "w-[252px]",
        )}
      >
        <Sidebar user={user} plan={plan} collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
      </aside>

      {/* Mobile/tablet: drawer */}
      <Dialog open={drawerOpen} onClose={closeDrawer} title="Menu" placement="left" hideHeader className="lg:hidden">
        <Sidebar user={user} plan={plan} onNavigate={closeDrawer} />
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur-md lg:hidden">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Abrir menu"
              aria-expanded={drawerOpen}
              className="-ml-1.5 grid size-9 place-items-center rounded-lg text-ink-2 outline-none transition-colors hover:bg-canvas focus-visible:ring-2 focus-visible:ring-brand-500/40"
            >
              <Menu className="size-5" aria-hidden />
            </button>
            <Logo />
          </div>
          <Avatar name={user.fullName} />
        </div>

        <main id="conteudo" className="flex min-w-0 flex-1 flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
