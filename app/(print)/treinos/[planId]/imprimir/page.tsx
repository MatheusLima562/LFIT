import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { PlanPrintSheet } from "@/features/plans/components/PlanPrintSheet";
import { getPlanForPrint } from "@/features/plans/queries";
import { messages } from "@/messages/pt-BR";

export const metadata: Metadata = { title: messages.plans.manage.print };

/** Folha A4 do treino, fora do AppShell (sem menu lateral). Sem dados de saúde nem alertas. */
export default async function PrintPlanPage({ params }: PageProps<"/treinos/[planId]/imprimir">) {
  const session = await requireStaff();
  const { planId } = await params;
  if (!z.uuid().safeParse(planId).success) notFound();
  const data = await getPlanForPrint(planId, session.organizationName);
  if (!data) notFound();
  const backHref = data.plan.studentId ? `/alunos/${data.plan.studentId}/treinos` : "/treinos/modelos";
  return <PlanPrintSheet data={data} backHref={backHref} />;
}
