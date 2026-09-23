import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { newKey, type PlanDraft } from "@/features/plans/builder";
import { PlanBuilder } from "@/features/plans/components/PlanBuilder";
import { getActivePlan, getStudentName, getStudentRules } from "@/features/plans/queries";
import { messages } from "@/messages/pt-BR";

export const metadata: Metadata = { title: messages.plans.newTitle };

/** Novo treino do aluno (?aluno=<id>) ou novo modelo (sem aluno). */
export default async function NewPlanPage({ searchParams }: PageProps<"/treinos/novo">) {
  await requireStaff();
  const raw = (await searchParams).aluno;
  const parsed = z.uuid().safeParse(Array.isArray(raw) ? raw[0] : raw);
  const studentId = parsed.success ? parsed.data : null;

  const student = studentId ? await getStudentName(studentId) : null;
  if (studentId && !student) notFound();
  const [rules, otherActive] = student
    ? await Promise.all([getStudentRules(student.id), getActivePlan(student.id)])
    : [{ hidden: false, rules: [] }, null];

  const initial: PlanDraft = {
    id: null,
    studentId: student?.id ?? null,
    name: "",
    goal: "",
    level: "",
    startsOn: "",
    endsOn: "",
    notes: "",
    workouts: [{ key: newKey(), label: "A", name: "", notes: "", items: [] }],
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-4 pt-5 sm:px-6 lg:px-8 lg:pt-6">
      <PlanBuilder
        initial={initial}
        status={null}
        student={student}
        rules={rules}
        canEdit
        otherActive={otherActive}
        backHref={student ? `/alunos/${student.id}/treinos` : "/treinos/modelos"}
      />
    </div>
  );
}
