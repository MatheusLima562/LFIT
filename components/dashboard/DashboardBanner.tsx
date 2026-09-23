import Link from "next/link";
import { ArrowRight, Gift, X } from "lucide-react";
import type { Banner } from "@/types/dashboard";

interface DashboardBannerProps {
  banner: Banner;
  onDismiss: () => void;
}

export function DashboardBanner({ banner, onDismiss }: DashboardBannerProps) {
  return (
    <aside
      aria-label="Oferta"
      className="relative isolate overflow-hidden rounded-2xl bg-linear-to-r from-brand-600 via-brand-500 to-[#ff8f57] px-5 py-4 text-white shadow-[0_1px_2px_rgb(181_62_19/0.3)] sm:px-6"
    >
      {/* Decoração */}
      <span aria-hidden className="absolute -top-16 right-40 -z-10 size-48 rounded-full bg-white/10" />
      <span aria-hidden className="absolute -right-10 -bottom-20 -z-10 size-56 rounded-full bg-white/10" />
      <span aria-hidden className="absolute top-3 right-[38%] -z-10 hidden size-2 rounded-full bg-white/40 md:block" />

      <div className="flex flex-col gap-3 pr-8 sm:flex-row sm:items-center sm:gap-4">
        <span aria-hidden className="hidden size-10 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25 sm:grid">
          <Gift className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold tracking-tight sm:text-base">{banner.title}</p>
          <p className="mt-0.5 text-[13px] text-white/85">{banner.description}</p>
        </div>
        <Link
          href={banner.href}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-xl bg-white px-4 text-xs font-bold tracking-wide text-brand-600 uppercase shadow-sm outline-none transition hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-white/70 sm:self-auto"
        >
          {banner.cta}
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fechar banner"
        className="absolute top-2.5 right-2.5 grid size-7 place-items-center rounded-lg text-white/80 outline-none transition-colors hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <X aria-hidden className="size-4" />
      </button>
    </aside>
  );
}
