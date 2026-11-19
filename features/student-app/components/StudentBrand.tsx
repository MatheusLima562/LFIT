import Link from "next/link";
import { BrandGlyph } from "@/features/brand/BrandMark";
import { BRAND } from "@/features/brand/config";

/**
 * Marca no topo do app do aluno (leva ao "Hoje"). Com o negócio do personal configurado, mostra o logo e o nome dele
 * (Configurações → Seu negócio); sem logo, o glifo do app com o nome do negócio.
 */
export function StudentBrand({ business }: { business?: { name: string; logoUrl: string | null } | null }) {
  const name = business?.name || BRAND.name;
  return (
    <Link href="/aluno" aria-label={`${name} — Hoje`} className="flex min-w-0 items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
      {business?.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage (fora do otimizador)
        <img src={business.logoUrl} alt="" className="size-8 shrink-0 rounded-[10px] bg-surface object-contain ring-1 ring-line" />
      ) : (
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-linear-to-br from-brand-400 to-brand-600 shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]"
        >
          <BrandGlyph className="text-white" />
        </span>
      )}
      <span className="truncate text-[17px] font-bold tracking-tight text-ink">{name}</span>
    </Link>
  );
}
