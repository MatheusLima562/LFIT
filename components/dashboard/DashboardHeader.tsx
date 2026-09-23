"use client";

import { ChevronDown, Plus, SlidersHorizontal } from "lucide-react";
import { quickActions } from "@/data/quick-actions";
import type { SearchableStudent } from "@/types/dashboard";
import { buttonClass } from "@/components/ui/button";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { StudentSearch } from "./StudentSearch";

interface DashboardHeaderProps {
  firstName: string;
  students: SearchableStudent[];
  onCustomize: () => void;
  onAction: (actionId: string) => void;
}

const newMenuItems = quickActions.map((a) => {
  const Icon = a.icon;
  return { id: a.id, label: a.menuLabel, description: a.description, icon: <Icon /> };
});

export function DashboardHeader({ firstName, students, onCustomize, onAction }: DashboardHeaderProps) {
  return (
    <header className="border-b border-line bg-surface/85 backdrop-blur-md lg:sticky lg:top-0 lg:z-20">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-[22px]">Olá, {firstName}</h1>
          <p className="mt-0.5 text-[13px] text-ink-2">Aqui está o resumo do seu negócio hoje</p>
        </div>

        <div className="flex w-full items-center gap-2 md:w-auto">
          <div className="min-w-0 flex-1 md:flex-none">
            <StudentSearch students={students} />
          </div>
          <button type="button" onClick={onCustomize} className={buttonClass("secondary", "md", "px-3 sm:px-4")}>
            <SlidersHorizontal aria-hidden />
            <span className="hidden sm:inline">Personalizar</span>
            <span className="sr-only sm:hidden">Personalizar</span>
          </button>
          <DropdownMenu
            heading="Criar novo"
            items={newMenuItems}
            onSelect={onAction}
            triggerClassName={buttonClass("primary", "md", "px-3 sm:px-4")}
            trigger={
              <>
                <Plus aria-hidden />
                <span>Novo</span>
                <ChevronDown aria-hidden className="-mr-1 hidden opacity-80 sm:block" />
              </>
            }
          />
        </div>
      </div>
    </header>
  );
}
