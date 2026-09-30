import Link from "next/link";

/** Marca do app do aluno (leva ao "Hoje", não ao painel do treinador). */
export function StudentBrand() {
  return (
    <Link href="/aluno" aria-label="LFit — Hoje" className="flex items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-linear-to-br from-brand-400 to-brand-600 shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]"
      >
        <svg viewBox="0 0 24 24" className="size-[18px] text-white" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 4v13h10" />
          <path d="M13 10h4" />
        </svg>
      </span>
      <span className="text-[17px] font-bold tracking-tight text-ink">LFit</span>
    </Link>
  );
}
