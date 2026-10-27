"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { messages } from "@/messages/pt-BR";

const t = messages.theme;

const options = [
  { value: "light", label: t.light, icon: Sun },
  { value: "dark", label: t.dark, icon: Moon },
  { value: "system", label: t.system, icon: Monitor },
] as const;

/** Alterna claro/escuro/sistema. O ícone troca via CSS (sem flash de hidratação). */
export function ThemeToggle({ side = "bottom" }: { side?: "top" | "bottom" | "right" }) {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t.label} className="text-ink-2 hover:text-ink">
          <Sun className="size-[18px] dark:hidden" aria-hidden />
          <Moon className="hidden size-[18px] dark:block" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="end" className="w-40">
        <DropdownMenuLabel>{t.label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          {options.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon aria-hidden />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
