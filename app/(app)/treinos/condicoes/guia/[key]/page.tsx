import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { GuideView } from "@/features/knowledge/components/GuideView";
import { getGuide } from "@/features/knowledge/guide-for";
import { messages } from "@/messages/pt-BR";

const t = messages.guides;

export async function generateMetadata({ params }: PageProps<"/treinos/condicoes/guia/[key]">): Promise<Metadata> {
  const guide = getGuide((await params).key);
  return { title: guide ? t.title(guide.title) : messages.conditions.title };
}

/** Guia de uma condição do catálogo: conteúdo geral (sem dados de aluno), visível a qualquer staff. */
export default async function GuidePage({ params }: PageProps<"/treinos/condicoes/guia/[key]">) {
  await requireStaff();
  const guide = getGuide((await params).key);
  if (!guide) notFound();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <Link href="/treinos/condicoes" className="inline-flex w-fit items-center gap-1 rounded text-[13px] text-brand-700 hover:underline">
        <ChevronLeft aria-hidden className="size-3.5" />
        {t.back}
      </Link>
      <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-[22px]">{t.title(guide.title)}</h1>
      <GuideView guide={guide} />
    </div>
  );
}
