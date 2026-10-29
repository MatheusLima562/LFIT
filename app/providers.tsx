"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={200}>
        {children}
        {/* No celular, acima da barra de abas do app do aluno (3.5rem + área segura): o aviso não cobre as abas. */}
        <Toaster position="bottom-center" richColors closeButton mobileOffset={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }} />
      </TooltipProvider>
    </ThemeProvider>
  );
}
