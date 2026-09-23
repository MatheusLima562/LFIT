"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, Sparkles } from "lucide-react";
import { useState } from "react";
import { isRouteActive, navigation } from "@/data/navigation";
import type { NavItem, PlanUsage, ShellUser } from "@/types/dashboard";
import { cn } from "@/lib/utils";
import { plural } from "@/lib/format";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

interface SidebarProps {
  user: ShellUser;
  plan: PlanUsage;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
}

const itemBase =
  "group relative flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-[13.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50";

const isAvailable = (item: NavItem) => item.status === "available";

function NavIcon({ item, active, muted }: { item: NavItem; active?: boolean; muted?: boolean }) {
  const Icon = item.icon;
  return (
    <Icon
      aria-hidden
      className={cn(
        "size-[18px] shrink-0",
        active ? "text-brand-500" : muted ? "text-ink-3/70" : "text-ink-3 group-hover:text-ink-2",
      )}
      strokeWidth={active ? 2.2 : 1.9}
    />
  );
}

function SoonBadge() {
  return (
    <span className="ml-auto shrink-0 text-[10px] font-medium tracking-wide text-ink-3 uppercase">{messages.app.soon}</span>
  );
}

function CountBadge({ count, collapsed }: { count: number; collapsed?: boolean }) {
  return (
    <span
      aria-label={`${count} não lidas`}
      className={cn(
        "grid place-items-center rounded-full bg-primary px-1 font-semibold text-primary-foreground",
        collapsed ? "absolute top-0.5 right-0.5 h-4 min-w-4 text-[9px]" : "ml-auto h-[18px] min-w-[18px] text-[10px]",
      )}
    >
      {count}
    </span>
  );
}

/** Item recolhido: só ícone + tooltip (inclusive nos desabilitados, via span focável). */
function CollapsedItem({ item, active }: { item: NavItem; active: boolean }) {
  const available = isAvailable(item);
  const label = available ? item.label : `${item.label} · ${messages.app.soon}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {available ? (
          <Link
            href={item.href}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(itemBase, "justify-center px-0", active ? "bg-brand-50 text-brand-700" : "hover:bg-canvas")}
          >
            <NavIcon item={item} active={active} />
            {item.badge ? <CountBadge count={item.badge} collapsed /> : null}
          </Link>
        ) : (
          <span tabIndex={0} aria-disabled="true" aria-label={label} className={cn(itemBase, "cursor-default justify-center px-0")}>
            <NavIcon item={item} muted />
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar({ user, plan, collapsed, onToggleCollapse, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    navigation.forEach((s) =>
      s.items.forEach((i) => isAvailable(i) && i.children && isRouteActive(pathname, i.href) && initial.add(i.id)),
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
          <Button variant="ghost" size="icon-sm" onClick={onToggleCollapse} aria-label="Recolher menu lateral" className="text-ink-3">
            <PanelLeftClose className="size-[18px]" aria-hidden />
          </Button>
        )}
      </div>

      <nav aria-label="Menu principal" className="flex-1 overflow-y-auto px-3 pb-3">
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
                const available = isAvailable(item);

                if (collapsed) {
                  return (
                    <li key={item.id}>
                      <CollapsedItem item={item} active={active} />
                    </li>
                  );
                }

                if (!available) {
                  return (
                    <li key={item.id}>
                      <span aria-disabled="true" className={cn(itemBase, "cursor-default text-ink-3")}>
                        <NavIcon item={item} muted />
                        <span className="truncate">{item.label}</span>
                        <SoonBadge />
                      </span>
                    </li>
                  );
                }

                if (!item.children?.length) {
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(itemBase, active ? "bg-brand-50 text-brand-700" : "text-ink-2 hover:bg-canvas hover:text-ink")}
                      >
                        <NavIcon item={item} active={active} />
                        <span className="truncate">{item.label}</span>
                        {item.badge ? <CountBadge count={item.badge} /> : null}
                      </Link>
                    </li>
                  );
                }

                const expanded = openIds.has(item.id);
                const submenuId = `submenu-${item.id}`;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => toggle(item.id)}
                      aria-expanded={expanded}
                      aria-controls={submenuId}
                      className={cn(itemBase, active ? "font-semibold text-ink" : "text-ink-2 hover:bg-canvas hover:text-ink")}
                    >
                      <NavIcon item={item} active={active} />
                      <span className="truncate">{item.label}</span>
                      <ChevronDown aria-hidden className={cn("ml-auto size-4 text-ink-3 transition-transform", expanded && "rotate-180")} />
                    </button>
                    <div
                      id={submenuId}
                      className={cn("grid transition-[grid-template-rows] duration-200", expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
                    >
                      <ul className="ml-[21px] overflow-hidden border-l border-line pl-3" inert={!expanded}>
                        {item.children.map((child) => {
                          const childActive = pathname === child.href;
                          if (child.status === "soon") {
                            return (
                              <li key={child.href} className="first:mt-0.5 last:mb-1">
                                <span aria-disabled="true" className="flex h-8 cursor-default items-center gap-2 rounded-md px-2.5 text-[13px] text-ink-3">
                                  <span className="truncate">{child.label}</span>
                                  <SoonBadge />
                                </span>
                              </li>
                            );
                          }
                          return (
                            <li key={child.href} className="first:mt-0.5 last:mb-1">
                              <Link
                                href={child.href}
                                onClick={onNavigate}
                                aria-current={childActive ? "page" : undefined}
                                className={cn(
                                  "relative flex h-8 items-center rounded-md px-2.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
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
            <p className="mt-2 text-xs text-ink-3">{plural(plan.remaining, "vaga disponível", "vagas disponíveis")}</p>
          </div>
        )}

        <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
          <UserMenu user={user} compact={collapsed} />
          <ThemeToggle side={collapsed ? "right" : "top"} />
          {collapsed && onToggleCollapse && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={onToggleCollapse} aria-label="Expandir menu lateral" className="text-ink-3">
                  <PanelLeftOpen className="size-[18px]" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Expandir menu</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}
