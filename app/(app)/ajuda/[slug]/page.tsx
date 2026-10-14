import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Markdown } from "@/features/help/components/Markdown";
import { getTutorial } from "@/features/help/queries";
import { requireStaff } from "@/lib/auth/session";
import { isoToBR } from "@/lib/dates";
import { messages } from "@/messages/pt-BR";

const t = messages.help;

export async function generateMetadata({ params }: PageProps<"/ajuda/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const tutorial = await getTutorial("professor", slug);
  return { title: tutorial ? tutorial.title : t.title };
}

export default async function TutorialPage({ params }: PageProps<"/ajuda/[slug]">) {
  await requireStaff();
  const { slug } = await params;
  const tutorial = await getTutorial("professor", slug);
  if (!tutorial) notFound();

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <Link href="/ajuda" className="mb-4 flex w-fit items-center gap-1 rounded text-[13px] text-ink-2 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50">
        <ChevronLeft aria-hidden className="size-4" />
        {t.back}
      </Link>
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-[22px]">{tutorial.title}</h1>
        <p className="mt-1 text-[14px] text-ink-2">{tutorial.summary}</p>
        <p className="mt-1 text-xs text-ink-3">{t.updated(isoToBR(tutorial.updated))}</p>
      </header>
      <Markdown source={tutorial.body} />
    </article>
  );
}
