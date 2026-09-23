"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, Settings, Sparkles } from "lucide-react";
import { useState } from "react";
import { navigation, isRouteActive } from "@/data/navigation";
import type { CurrentUser, NavItem, PlanUsage } from "@/types/dashboard";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/Avatar";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Tooltip } from "@/components/ui/Tooltip";
import { Logo } from "./Logo";

interface SidebarProps {
  user: CurrentUser;
  plan: PlanUsage;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
}

const itemBase =
  "group relative flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-[13.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-500/40";

function itemTone(active: boolean) {
  return active ? "bg-brand-50 text-brand-700" : "text-ink-2 hover:bg-canvas hover:text-ink";
}

function NavIcon({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Icon
      aria-hidden
      className={cn("size-[18px] shrink-0", active ? "text-brand-500" : "text-ink-3 group-hover:text-ink-2")}
      strokeWidth={active ? 2.2 : 1.9}
    />
  );
}

function Badge({ count, collapsed }: { count: number; collapsed?: boolean }) {
  return (
    <span
      aria-label={`${count} não lidas`}
      className={cn(
        "grid min-w-[18px] place-items-center rounded-full bg-brand-500 px-1 text-[10px] leading-[18px] font-semibold text-white",
        collapsed ? "absolute top-0.5 right-0.5 h-4 min-w-4 text-[9px] leading-4" : "ml-auto h-[18px]",
      )}
    >
      {count}
    </span>
  );
}

export function Sidebar({ user, plan, collapsed, onToggleCollapse, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    navigation.forEach((s) =>
      s.items.forEach((i) => i.children && isRouteActive(pathname, i.href) && initial.add(i.id)),
    );
    return initial;
  });

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex h-full w-full flex-col bg-surface">
      <div className={cn("flex h-16 shrink-0 items-center px-4", collapsed ? "justify-center" : "justify-between")}>
        <Logo compact={collapsed} onNavigate={onNavigate} />
        {onToggleCollapse && !collapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Recolher menu lateral"
            className="grid size-8 place-items-center rounded-lg text-ink-3 outline-none transition-colors hover:bg-canvas hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-500/40"
          >
            <PanelLeftClose className="size-[18px]" aria-hidden />
          </button>
        )}
      </div>

      <nav
        aria-label="Menu principal"
        className={cn("flex-1 px-3 pb-3", collapsed ? "overflow-visible" : "overflow-y-auto")}
      >
        {navigation.map((section, sectionIndex) => (
          <div key={section.id} className={cn(sectionIndex > 0 && "mt-4")}>
            {section.title &&
              (collapsed ? (
                <hr className="mx-2 mb-3 border-line" />
              ) : (
                <p className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">
                  {section.title}
                </p>
              ))}
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const active = isRouteActive(pathname, item.href);
                const hasChildren = !!item.children?.length;
                const expanded = openIds.has(item.id);

                if (collapsed) {
                  return (
                    <li key={item.id}>
                      <Tooltip content={item.label} side="right" className="w-full">
                        <Link
                          href={item.href}
                          aria-label={item.label}
                          aria-current={active ? "page" : undefined}
                          className={cn(itemBase, "justify-center px-0", itemTone(active))}
                        >
                          <NavIcon item={item} active={active} />
                          {item.badge ? <Badge count={item.badge} collapsed /> : null}
                        </Link>
                      </Tooltip>
                    </li>
                  );
                }

                if (!hasChildren) {
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(itemBase, itemTone(active))}
                      >
                        <NavIcon item={item} active={active} />
                        <span className="truncate">{item.label}</span>
                        {item.badge ? <Badge count={item.badge} /> : null}
                      </Link>
                    </li>
                  );
                }

                const submenuId = `submenu-${item.id}`;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => toggle(item.id)}
                      aria-expanded={expanded}
                      aria-controls={submenuId}
                      className={cn(itemBase, active ? "text-ink" : itemTone(false), active && "font-semibold")}
                    >
                      <NavIcon item={item} active={active} />
                      <span className="truncate">{item.label}</span>
                      <ChevronDown
                        aria-hidden
                        className={cn("ml-auto size-4 text-ink-3 transition-transform", expanded && "rotate-180")}
                      />
                    </button>
                    <div
                      id={submenuId}
                      className={cn(
                        "grid transition-[grid-template-rows] duration-200",
                        expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                      )}
                    >
                      <ul className="ml-[21px] overflow-hidden border-l border-line pl-3" inert={!expanded}>
                        {item.children!.map((child) => {
                          const childActive = pathname === child.href;
                          return (
                            <li key={child.href} className="first:mt-0.5 last:mb-1">
                              <Link
                                href={child.href}
                                onClick={onNavigate}
                                aria-current={childActive ? "page" : undefined}
                                className={cn(
                                  "relative flex h-8 items-center rounded-md px-2.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-500/40",
                                  childActive
                                    ? "bg-brand-50 font-medium text-brand-700 before:absolute before:top-2 before:bottom-2 before:-left-[13px] before:w-0.5 before:rounded-full before:bg-brand-500"
                                    : "text-ink-2 hover:bg-canvas hover:text-ink",
                                )}
                              >
                                {child.label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-line p-3">
        {!collapsed && (
          <div className="mb-3 rounded-xl border border-line bg-linear-to-b from-canvas to-surface p-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                <Sparkles aria-hidden className="size-3.5 text-brand-500" />
                Plano {plan.planName}
              </span>
              <span className="tabular text-xs font-medium text-ink-2">
                {plan.used}/{plan.limit}
              </span>
            </div>
            <ProgressBar value={plan.used} max={plan.limit} label="Alunos usados no plano" className="mt-2 h-1.5" />
            <Link
              href="/vendas/planos"
              onClick={onNavigate}
              className="mt-2.5 inline-flex rounded text-xs font-medium text-brand-600 outline-none hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500/40"
            >
              Fazer upgrade
            </Link>
          </div>
        )}

        <div className={cn("flex items-center gap-2.5", collapsed && "flex-col")}>
          <Avatar name={user.fullName} size="lg" />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-ink">{user.fullName}</p>
              <p className="truncate text-xs text-ink-3">{user.role}</p>
            </div>
          )}
          <Tooltip content="Perfil e configurações" side={collapsed ? "right" : "top"}>
            <Link
              href="/configuracoes"
              onClick={onNavigate}
              aria-label="Perfil e configurações"
              className="grid size-8 place-items-center rounded-lg text-ink-3 outline-none transition-colors hover:bg-canvas hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-500/40"
            >
              <Settings className="size-4" aria-hidden />
            </Link>
          </Tooltip>
          {collapsed && onToggleCollapse && (
            <Tooltip content="Expandir menu" side="right">
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label="Expandir menu lateral"
                className="grid size-8 place-items-center rounded-lg text-ink-3 outline-none transition-colors hover:bg-canvas hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-500/40"
              >
                <PanelLeftOpen className="size-[18px]" aria-hidden />
              </button>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}
