import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Plus } from "lucide-react";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { ApplyTemplateButton } from "@/features/plans/components/ApplyTemplateButton";
import { PlanCard } from "@/features/plans/components/PlanCard";
import { getStudentName, listStudentPlans, listTemplateOptions } from "@/features/plans/queries";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dumbbell } from "lucide-react";

const t = messages.plans.manage;

export const metadata: Metadata = { title: messages.plans.overview.title };

export default async function StudentPlansPage({ params }: PageProps<"/alunos/[id]/treinos">) {
  const session = await requireStaff();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const student = await getStudentName(id);
  if (!student) notFound();
  const [plans, templates] = await Promise.all([listStudentPlans(id, session), listTemplateOptions()]);

  const section = (title: string, items: typeof plans.drafts, empty: string) => (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {items.length === 0 ? (
        <p className="text-[13px] text-ink-3">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((p) => (
            <PlanCard key={p.id} plan={p} />
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/alunos" className="mb-2 inline-flex items-center gap-1 rounded text-xs text-ink-3 hover:text-ink">
            <ChevronLeft aria-hidden className="size-3.5" />
            {t.backToStudents}
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-[22px]">{t.studentTitle(student.name)}</h1>
          <p className="mt-0.5 text-[13px] text-ink-2">{t.studentSubtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ApplyTemplateButton student={student} templates={templates} />
          <Button asChild>
            <Link href={`/treinos/novo?aluno=${student.id}`}>
              <Plus aria-hidden />
              {t.newPlan}
            </Link>
          </Button>
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-ink">{t.active}</h2>
        {plans.active ? (
          <ul>
            <PlanCard plan={plans.active} />
          </ul>
        ) : (
          <EmptyState icon={<Dumbbell />} message={t.noActive} className="min-h-32 bg-surface" />
        )}
      </section>
      {section(t.drafts, plans.drafts, t.noDrafts)}
      {section(t.history, plans.archived, t.noHistory)}
    </div>
  );
}
