import Link from "next/link";
import { FileWarning } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { withBrand } from "@/features/brand/config";
import { Markdown } from "@/features/help/components/Markdown";
import { LEGAL_DRAFT_NOTICE } from "./texts";

/** Página legal pública (rascunho): faixa de aviso fixa no topo + texto em Markdown. */
export function LegalPage({ title, markdown }: { title: string; markdown: string }) {
  return (
    <div className="min-h-dvh bg-canvas px-4 py-6 sm:py-10">
      <div className="mx-auto flex max-w-3xl items-center justify-between pb-6">
        <Logo />
        <ThemeToggle />
      </div>
      <main className="mx-auto max-w-3xl rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-8">
        <p role="note" className="mb-5 flex items-center gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm font-semibold text-warning-ink ring-1 ring-warning-line">
          <FileWarning aria-hidden className="size-4 shrink-0" />
          {LEGAL_DRAFT_NOTICE.toUpperCase()}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        <div className="mt-4">
          <Markdown source={withBrand(markdown)} />
        </div>
      </main>
      <LegalFooter className="mx-auto mt-6 max-w-3xl" />
    </div>
  );
}

/** Rodapé com os links legais (login do professor, login do aluno, cadastro público e as próprias páginas). */
export function LegalFooter({ className }: { className?: string }) {
  return (
    <nav aria-label="Documentos legais" className={className}>
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-ink-3">
        <li>
          <Link href="/privacidade" className="link">
            Política de Privacidade
          </Link>
        </li>
        <li>
          <Link href="/termos" className="link">
            Termos de Uso
          </Link>
        </li>
        <li aria-hidden>·</li>
        <li>rascunho</li>
      </ul>
    </nav>
  );
}
