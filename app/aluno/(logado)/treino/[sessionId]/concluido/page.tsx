import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, CircleCheck, Flame, MessageSquareText } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { consistency, recordNames } from "@/features/student-app/humanize";
import { SessionRating } from "@/features/student-app/components/SessionRating";
import { getMyProfile, getSessionDone } from "@/features/student-app/queries";
import { messages } from "@/messages/pt-BR";

const t = messages.aluno;

export const metadata: Metadata = { title: t.done.title };

/**
 * Fim de treino (2.12, 3.2). A execução só chega aqui depois de a fila local esvaziar (o "finalizar" já está no banco).
 * Destaque na constância; recorde como selo discreto (só com carga anterior em sessão concluída, mesma unidade — regra
 * de `get_session_summary`); nota de 1 a 5 opcional.
 */
export default async function StudentSessionDonePage({ params }: PageProps<"/aluno/treino/[sessionId]/concluido">) {
  const { sessionId } = await params;
  if (!z.uuid().safeParse(sessionId).success) notFound();
  const [done, profile] = await Promise.all([getSessionDone(sessionId), getMyProfile()]);
  if (!done) notFound();

  if (done.status !== "completed") {
    return (
      <section className="flex flex-col items-center gap-4 px-4 pt-14 text-center">
        <p className="text-sm text-ink-2">{t.done.notCompleted}</p>
        <Button asChild variant="outline">
          <Link href="/aluno">{t.done.backToday}</Link>
        </Button>
      </section>
    );
  }

  const workout = done.workout_name ? `Treino ${done.workout_label} · ${done.workout_name}` : `Treino ${done.workout_label}`;
  const records = recordNames(done.summary.records);
  const c = profile ? consistency(profile.sessions_this_month, profile.week_streak) : null;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col items-center px-2 pt-4 text-center">
        <span aria-hidden className="grid size-14 place-items-center rounded-full bg-success-soft text-success-ink ring-1 ring-success-line">
          <CircleCheck className="size-7" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">{t.done.title}</h1>
        <p className="mt-1 text-sm text-ink-2">{t.done.subtitle(workout)}</p>
        <p className="mt-1 text-[13px] text-ink-3">
          {t.done.exercises(done.summary.exercises_done)} · {t.done.sets(done.summary.sets_done)}
        </p>
      </section>

      {c && (
        <section className="flex items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-canvas text-ink-2 ring-1 ring-line">
            <Flame className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-ink">{c.headline}</p>
            {c.detail && <p className="text-[13px] text-ink-2">{c.detail}</p>}
          </div>
        </section>
      )}

      {records.length > 0 && (
        <section aria-labelledby="records" className="flex flex-col gap-1.5">
          <h2 id="records" className="sr-only">
            {t.done.records}
          </h2>
          <ul className="flex flex-wrap gap-1.5">
            {records.map((name) => (
              <li key={name} className="flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-ink-2 ring-1 ring-line">
                <Award aria-hidden className="size-3.5 text-ink-3" />
                {t.done.records}: {name}
              </li>
            ))}
          </ul>
        </section>
      )}

      {done.hasFeedback && (
        <p className="flex items-center gap-2 rounded-xl bg-canvas px-3 py-2 text-[13px] text-ink-2 ring-1 ring-line">
          <MessageSquareText aria-hidden className="size-4 shrink-0 text-ink-3" />
          {t.done.feedbackSeen}
        </p>
      )}

      <SessionRating sessionId={done.id} initial={done.rating} />

      <div className="flex flex-col gap-2 pt-1">
        <Button asChild size="lg" className="h-12 text-base">
          <Link href="/aluno">{t.done.backToday}</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/aluno/historico">{t.done.history}</Link>
        </Button>
      </div>
    </div>
  );
}
