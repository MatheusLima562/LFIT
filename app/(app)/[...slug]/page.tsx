import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, Hammer } from "lucide-react";
import { findRoute, moduleRoutes } from "@/data/navigation";
import { buttonClass } from "@/components/ui/button";

export const dynamicParams = false;

export function generateStaticParams() {
  return moduleRoutes().map((href) => ({ slug: href.slice(1).split("/") }));
}

async function resolve(params: PageProps<"/[...slug]">["params"]) {
  const { slug } = await params;
  return findRoute(`/${slug.join("/")}`);
}

export async function generateMetadata({ params }: PageProps<"/[...slug]">): Promise<Metadata> {
  const route = await resolve(params);
  return { title: route?.child?.label ?? route?.item.label };
}

/** Página provisória dos módulos ainda não implementados. */
export default async function ModulePage({ params }: PageProps<"/[...slug]">) {
  const route = await resolve(params);
  if (!route) notFound();

  const { item, child } = route;
  const Icon = item.icon;
  const title = child?.label ?? item.label;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
      <nav aria-label="Trilha" className="mb-2 flex items-center gap-1 text-xs text-ink-3">
        <Link href="/" className="hover:text-ink">Início</Link>
        <ChevronRight aria-hidden className="size-3" />
        {child ? (
          <>
            <Link href={item.href} className="hover:text-ink">{item.label}</Link>
            <ChevronRight aria-hidden className="size-3" />
          </>
        ) : null}
        <span aria-current="page" className="text-ink-2">{title}</span>
      </nav>
      <h1 className="flex items-center gap-2.5 text-[22px] font-semibold tracking-tight">
        <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <Icon className="size-5" />
        </span>
        {title}
      </h1>

      <div className="mt-6 flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-16 text-center">
        <span aria-hidden className="grid size-12 place-items-center rounded-full bg-surface text-ink-3 shadow-card ring-1 ring-line">
          <Hammer className="size-5" />
        </span>
        <h2 className="mt-4 text-base font-semibold">Módulo em construção</h2>
        <p className="mt-1 max-w-sm text-sm text-ink-2">
          A área de {title.toLowerCase()} ainda está sendo desenvolvida. Enquanto isso, acompanhe tudo pelo início.
        </p>
        <Link href="/" className={buttonClass("secondary", "md", "mt-5")}>
          <ArrowLeft aria-hidden />
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
