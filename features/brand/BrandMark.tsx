import { cn } from "@/lib/utils";
import { BRAND } from "./config";

/** O "L" da marca (SVG), herdando a cor do texto. Usado no painel, no app do aluno e no login. */
export function BrandGlyph({ className, strokeWidth = 2.6 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-[18px]", className)} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {BRAND.logoPaths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
