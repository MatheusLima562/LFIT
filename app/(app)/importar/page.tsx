import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ImportHistory } from "@/features/import/components/ImportHistory";
import { ImportWizard } from "@/features/import/components/ImportWizard";
import { getRecentImportBatches } from "@/features/import/queries";
import { getOrganizationPlanUsage } from "@/features/organizations/queries";
import { requireStaff } from "@/lib/auth/session";
import { messages } from "@/messages/pt-BR";

const t = messages.importer;

export const metadata: Metadata = { title: t.title };

/** Importação de alunos (professor e owner; aluno é mandado para o app pelo `requireStaff`). */
export default async function ImportPage() {
  const session = await requireStaff();
  const [plan, history] = await Promise.all([getOrganizationPlanUsage(), getRecentImportBatches()]);
  const now = new Date().toISOString();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <header>
        <Link href="/alunos" className="mb-2 inline-flex items-center gap-1 rounded text-xs text-ink-3 hover:text-ink">
          <ChevronLeft aria-hidden className="size-3.5" />
          {messages.students.title}
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-[22px]">{t.title}</h1>
        <p className="mt-0.5 max-w-2xl text-[13px] text-ink-2">{t.subtitle}</p>
      </header>
      <ImportWizard role={session.role === "owner" ? "owner" : "trainer"} seatsLeft={plan.remaining} />
      <ImportHistory batches={history} now={now} />
    </div>
  );
}
