import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ChevronRight, CirclePlay } from "lucide-react";
import { listTutorials } from "@/features/help/queries";
import { tutorialVideoEmbed } from "@/features/help/video";
import { requireStaff } from "@/lib/auth/session";
import { isoToBR } from "@/lib/dates";
import { messages } from "@/messages/pt-BR";

const t = messages.help;

export const metadata: Metadata = { title: t.title };

/** Lista dos tutoriais do professor (content/tutoriais/professor), na ordem do campo `order`. */
export default async function HelpPage() {
  await requireStaff();
  const tutorials = await listTutorials("professor");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-[22px]">{t.title}</h1>
        <p className="mt-0.5 max-w-2xl text-[13px] text-ink-2">{t.subtitle}</p>
      </header>
      {tutorials.length === 0 ? (
        <p className="text-sm text-ink-3">{t.empty}</p>
      ) : (
        <ol aria-label={t.listLabel} className="flex flex-col gap-2">
          {tutorials.map((tut) => (
            <li key={tut.slug}>
              <Link
                href={`/ajuda/${tut.slug}`}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-card outline-none transition-colors hover:bg-canvas focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-canvas text-ink-2 ring-1 ring-line">
                  <BookOpen className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-ink">{tut.title}</span>
                  <span className="mt-0.5 block text-[13px] text-ink-2">{tut.summary}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                    {t.updated(isoToBR(tut.updated))}
                    {tutorialVideoEmbed(tut.videoUrl) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 font-medium text-ink-2 ring-1 ring-line">
                        <CirclePlay aria-hidden className="size-3.5" />
                        {t.withVideo}
                      </span>
                    )}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-3" />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
