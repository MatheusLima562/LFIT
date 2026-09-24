import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Plus } from "lucide-react";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { ApplyTemplateButton } from "@/features/plans/components/ApplyTemplateButton";
import { PlanCard } from "@/features/plans/components/PlanCard";
import { getStudentName, listStudentPlans, listTemplateOptions, type PlanSummary } from "@/features/plans/queries";
import { todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dumbbell } from "lucide-react";

const t = messages.plans.manage;
const TABS = ["atuais", "futuros", "anteriores", "todos"] as const;
type Tab = (typeof TABS)[number];

export const metadata: Metadata = { title: messages.plans.overview.title };

export default async function StudentPlansPage({ params, searchParams }: PageProps<"/alunos/[id]/treinos">) {
  const session = await requireStaff();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const student = await getStudentName(id);
  if (!student) notFound();
  const [plans, templates] = await Promise.all([listStudentPlans(id, session), listTemplateOptions()]);

  // Abas pela URL (?aba=). Agendado cuja data já chegou conta como atual até o job diário rodar.
  const today = todayISO();
  const due = (p: PlanSummary) => p.status === "scheduled" && p.startsOn !== null && p.startsOn <= today;
  const byStart = (a: PlanSummary, b: PlanSummary) => (b.startsOn ?? "").localeCompare(a.startsOn ?? "");
  const lists: Record<Tab, PlanSummary[]> = {
    atuais: [...(plans.active ? [plans.active] : []), ...plans.scheduled.filter(due), ...plans.drafts],
    futuros: plans.scheduled.filter((p) => !due(p)).sort((a, b) => (a.startsOn ?? "").localeCompare(b.startsOn ?? "")),
    anteriores: [...plans.archived].sort(byStart),
    todos: [...(plans.active ? [plans.active] : []), ...plans.scheduled, ...plans.drafts, ...plans.archived].sort(byStart),
  };
  const rawTab = (await searchParams).aba;
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "atuais";
  const items = lists[tab];
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

      <nav aria-label={t.tabsLabel} className="-mb-px flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((k) => {
          const current = k === tab;
          return (
            <Link
              key={k}
              href={k === "atuais" ? `/alunos/${student.id}/treinos` : `/alunos/${student.id}/treinos?aba=${k}`}
              aria-current={current ? "page" : undefined}
              scroll={false}
              className={cn(
                "relative inline-flex h-10 shrink-0 items-center gap-2 rounded-t-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                current ? "text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand-500" : "text-ink-2 hover:text-ink",
              )}
            >
              {t.tabs[k]}
              <span className={cn("tabular rounded-full px-1.5 py-px text-xs", current ? "bg-brand-50 text-brand-700" : "bg-canvas text-ink-3")}>
                {lists[k].length}
              </span>
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <EmptyState icon={<Dumbbell />} message={t.empty[tab]} className="min-h-32 bg-surface" />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((p) => (
            <PlanCard key={p.id} plan={p} />
          ))}
        </ul>
      )}
    </div>
  );
}
