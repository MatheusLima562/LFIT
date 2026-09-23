import Link from "next/link";
import { cn } from "@/lib/cn";

export function Logo({ compact, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href="/"
      onClick={onNavigate}
      aria-label="LFit — Início"
      className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
    >
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-linear-to-br from-brand-400 to-brand-600 shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_1px_2px_rgb(219_79_25/0.4)]"
      >
        <svg viewBox="0 0 24 24" className="size-[18px] text-white" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 4v13h10" />
          <path d="M13 10h4" />
        </svg>
      </span>
      <span className={cn("flex items-baseline gap-1.5", compact && "sr-only")}>
        <span className="text-[17px] font-bold tracking-tight text-ink">LFit</span>
        <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-brand-700 uppercase">
          Personal
        </span>
      </span>
    </Link>
  );
}
