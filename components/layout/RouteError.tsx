"use client";

import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { messages } from "@/messages/pt-BR";

const t = messages.app;

/**
 * Tela de erro recuperável dentro do layout (o menu continua): no lugar de "This page couldn't load" do Next.
 * Nunca mostra a mensagem do erro (pode conter dado do aluno); "Tentar de novo" busca a tela outra vez (sem `retry`, quando
 * usada fora de um error boundary — ex.: no layout —, recarrega a página).
 */
export function RouteError({ retry, homeHref }: { retry?: () => void; homeHref: string }) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center">
      <span aria-hidden className="grid size-12 place-items-center rounded-full bg-warning-soft text-warning-ink ring-1 ring-warning-line">
        <TriangleAlert className="size-6" />
      </span>
      <h1 className="mt-4 text-lg font-semibold text-ink">{t.errorTitle}</h1>
      <p className="mt-2 text-sm text-ink-2">{t.errorText}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={() => (retry ? retry() : window.location.reload())}>
          <RotateCcw aria-hidden />
          {t.errorRetry}
        </Button>
        <Button asChild variant="outline">
          <Link href={homeHref}>{t.errorHome}</Link>
        </Button>
      </div>
    </div>
  );
}
