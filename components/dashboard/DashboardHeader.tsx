"use client";

import { ChevronDown, Plus, Search, SlidersHorizontal } from "lucide-react";
import { quickActions } from "@/data/quick-actions";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface DashboardHeaderProps {
  firstName: string;
  onCustomize: () => void;
}

/** Busca de alunos: ativa junto com o módulo Alunos (etapa 1.2). */
function StudentSearchSoon() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div tabIndex={0} className="relative w-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:w-64 xl:w-72">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <input
            type="text"
            disabled
            aria-label="Buscar aluno (em breve)"
            placeholder="Buscar aluno"
            className="h-9 w-full cursor-not-allowed rounded-xl border border-line bg-surface pr-12 pl-9 text-sm text-ink shadow-card outline-none placeholder:text-ink-3 disabled:opacity-70"
          />
          <kbd
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded-md border border-line bg-canvas px-1.5 py-0.5 font-sans text-[11px] font-medium text-ink-3 sm:block"
          >
            ⌘K
          </kbd>
        </div>
      </TooltipTrigger>
      <TooltipContent>A busca de alunos chega com o módulo Alunos.</TooltipContent>
    </Tooltip>
  );
}

export function DashboardHeader({ firstName, onCustomize }: DashboardHeaderProps) {
  return (
    <header className="border-b border-line bg-surface/85 backdrop-blur-md lg:sticky lg:top-0 lg:z-20">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-[22px]">Olá, {firstName}</h1>
          <p className="mt-0.5 text-[13px] text-ink-2">Aqui está o resumo do seu negócio hoje</p>
        </div>

        <div className="flex w-full items-center gap-2 md:w-auto">
          <div className="min-w-0 flex-1 md:flex-none">
            <StudentSearchSoon />
          </div>
          <Button variant="outline" onClick={onCustomize} className="px-3 sm:px-3.5">
            <SlidersHorizontal aria-hidden />
            <span className="sr-only sm:not-sr-only">Personalizar</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="px-3 sm:px-3.5">
                <Plus aria-hidden />
                Novo
                <ChevronDown aria-hidden className="-mr-1 hidden opacity-80 sm:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Criar novo</DropdownMenuLabel>
              {quickActions.map((action) => {
                const Icon = action.icon;
                const available = action.status === "available";
                return (
                  <DropdownMenuItem key={action.id} disabled={!available} className="gap-3 py-2">
                    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-ink">{action.menuLabel}</span>
                      <span className="block truncate text-xs text-ink-3">{action.description}</span>
                    </span>
                    {!available && (
                      <span className="shrink-0 text-[10px] font-semibold tracking-wide text-ink-3 uppercase">
                        {messages.app.soon}
                      </span>
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
