import Link from "next/link";
import { BrandGlyph } from "@/features/brand/BrandMark";
import { BRAND } from "@/features/brand/config";

/** Marca do app do aluno (leva ao "Hoje", não ao painel do treinador). */
export function StudentBrand() {
  return (
    <Link href="/aluno" aria-label={`${BRAND.name} — Hoje`} className="flex items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-linear-to-br from-brand-400 to-brand-600 shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]"
      >
        <BrandGlyph className="text-white" />
      </span>
      <span className="text-[17px] font-bold tracking-tight text-ink">{BRAND.name}</span>
    </Link>
  );
}
