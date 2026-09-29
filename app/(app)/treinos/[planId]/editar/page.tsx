import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { fromSaved } from "@/features/plans/builder";
import { PlanBuilder } from "@/features/plans/components/PlanBuilder";
import { getPlanForBuilder, getStudentRules, listTrainingLists } from "@/features/plans/queries";
import { getPlanRedFlagPending, getStudentHealthGuides, getStudentRedFlag } from "@/features/knowledge/queries";
import { messages } from "@/messages/pt-BR";

export const metadata: Metadata = { title: messages.plans.editTitle };

export default async function EditPlanPage({ params }: PageProps<"/treinos/[planId]/editar">) {
  const session = await requireStaff();
  const { planId } = await params;
  if (!z.uuid().safeParse(planId).success) notFound();
  const data = await getPlanForBuilder(planId, session);
  if (!data) notFound();
  const [rules, lists, health, redFlag] = await Promise.all([
    data.student ? getStudentRules(data.student.id) : Promise.resolve({ hidden: false, rules: [] }),
    listTrainingLists(),
    data.student ? getStudentHealthGuides(data.student.id) : Promise.resolve(null),
    data.student ? getStudentRedFlag(data.student.id) : Promise.resolve(null),
  ]);
  // Sem acesso à triagem pelo RLS (professor do plano): só o booleano de pendência.
  const redFlagRestrictedPending = data.student && !redFlag ? await getPlanRedFlagPending(planId) : false;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-4 pt-5 sm:px-6 lg:px-8 lg:pt-6">
      <PlanBuilder
        key={planId}
        initial={fromSaved(data.plan)}
        status={data.status}
        student={data.student}
        trainers={data.trainers}
        lists={lists}
        rules={rules}
        health={health}
        redFlag={redFlag}
        redFlagRestrictedPending={redFlagRestrictedPending}
        canRegisterRedFlag={data.canRegisterRedFlag}
        canEdit={data.canEdit}
        otherActive={data.otherActive}
        backHref={data.student ? `/alunos/${data.student.id}/treinos` : "/treinos/modelos"}
      />
    </div>
  );
}
