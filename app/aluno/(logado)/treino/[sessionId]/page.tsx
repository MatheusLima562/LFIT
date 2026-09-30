import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { SessionRunnerClient } from "@/features/student-app/components/SessionRunnerClient";
import { getTrainingSession } from "@/features/student-app/queries";
import { messages } from "@/messages/pt-BR";

const t = messages.aluno;

export const metadata: Metadata = { title: t.run.finish.replace("Finalizar ", "") };

export default async function StudentSessionPage({ params, searchParams }: PageProps<"/aluno/treino/[sessionId]">) {
  const { sessionId } = await params;
  if (!z.uuid().safeParse(sessionId).success) notFound();
  const [data, sp] = await Promise.all([getTrainingSession(sessionId), searchParams]);
  if (!data) notFound();

  if (data.session.status !== "in_progress") {
    return (
      <section className="flex flex-col items-center gap-4 px-4 pt-14 text-center">
        <p className="text-sm text-ink-2">{t.run.closed}</p>
        <Button asChild variant="outline">
          <Link href="/aluno/historico">{t.nav.history}</Link>
        </Button>
      </section>
    );
  }

  return <SessionRunnerClient data={data} askCheckin={sp.checkin === "1" && data.session.pain_checkin === null} />;
}
