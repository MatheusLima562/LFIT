import Link from "next/link";
import { BrandGlyph } from "@/features/brand/BrandMark";
import { BRAND } from "@/features/brand/config";
import { cn } from "@/lib/utils";

export function Logo({ compact, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href="/"
      onClick={onNavigate}
      aria-label={`${BRAND.name} — Início`}
      className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
    >
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-linear-to-br from-brand-400 to-brand-600 shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_1px_2px_rgb(219_79_25/0.4)]"
      >
        <BrandGlyph className="text-white" />
      </span>
      <span className={cn("flex items-baseline gap-1.5", compact && "sr-only")}>
        <span className="text-[17px] font-bold tracking-tight text-ink">{BRAND.name}</span>
        <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-brand-700 uppercase">
          {BRAND.staffBadge}
        </span>
      </span>
    </Link>
  );
}
