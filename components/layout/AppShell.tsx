"use client";

import { Menu } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { PlanUsage, ShellUser } from "@/types/dashboard";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Logo } from "./Logo";
import { Sidebar } from "./Sidebar";
import { UserMenu } from "./UserMenu";

interface AppShellProps {
  user: ShellUser;
  plan: PlanUsage;
  children: ReactNode;
}

export function AppShell({ user, plan, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#conteudo"
        className="fixed top-2 left-2 z-[60] -translate-y-20 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-surface transition-transform focus:translate-y-0"
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
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" showCloseButton={false} className="w-[18rem] max-w-[85vw] gap-0 p-0 lg:hidden">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Navegação principal do LFit</SheetDescription>
          <Sidebar user={user} plan={plan} onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur-md lg:hidden">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDrawerOpen(true)}
              aria-label="Abrir menu"
              aria-expanded={drawerOpen}
              className="-ml-1.5 text-ink-2"
            >
              <Menu className="size-5" aria-hidden />
            </Button>
            <Logo />
          </div>
          <UserMenu user={user} compact />
        </div>

        <main id="conteudo" className="flex min-w-0 flex-1 flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
