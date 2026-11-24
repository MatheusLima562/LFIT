import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";
import { EmptyState } from "@/components/ui/EmptyState";
import { getStudentName } from "@/features/plans/queries";
import { BulkProgression } from "@/features/prescription/components/BulkProgression";
import { PrescriptionHistory } from "@/features/prescription/components/PrescriptionHistory";
import { QuickEditSheet } from "@/features/prescription/components/QuickEditSheet";
import { SuggestionsPanel } from "@/features/prescription/components/SuggestionsPanel";
import { computeSuggestions } from "@/features/prescription/prescription";
import { getPrescriptionReview, getQuickSheet, listPrescriptionChanges } from "@/features/prescription/queries";
import { requireStaff } from "@/lib/auth/session";
import { messages } from "@/messages/pt-BR";
import { Dumbbell } from "lucide-react";

const t = messages.prescription;

export const metadata: Metadata = { title: t.sheetTitle };

/**
 * Ficha rápida do treino do aluno (PARTE A; PARTE B entra aqui quando ligada): +/− carga, repetições e séries, progressão
 * em lote com prévia, sugestões das sessões e histórico com desfazer. Pensada para o celular do personal durante a aula.
 */
export default async function QuickSheetPage({ params }: PageProps<"/alunos/[id]/treinos/ficha">) {
  const session = await requireStaff();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const student = await getStudentName(id);
  if (!student) notFound();
  const [sheet, review, history] = await Promise.all([
    getQuickSheet(id, session.organizationId),
    getPrescriptionReview(id),
    listPrescriptionChanges(id),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6 lg:py-6">
      <header>
        <Link href={`/alunos/${id}/treinos`} className="mb-2 inline-flex items-center gap-1 rounded text-xs text-ink-3 hover:text-ink">
          <ChevronLeft aria-hidden className="size-3.5" />
          {t.back}
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{t.sheetTitle} · {student.name}</h1>
        {sheet && <p className="mt-0.5 text-[13px] text-ink-2">{t.sheetSubtitle(sheet.planName)}</p>}
      </header>

      {!sheet ? (
        <EmptyState icon={<Dumbbell />} message={t.noPlan} className="min-h-32 bg-surface" />
      ) : (
        <>
          <SuggestionsPanel suggestions={computeSuggestions(review)} />
          <QuickEditSheet workouts={sheet.workouts} loadStep={sheet.loadStep} />
          <BulkProgression workouts={sheet.workouts} loadStep={sheet.loadStep} />
          <PrescriptionHistory batches={history} />
        </>
      )}
    </div>
  );
}
