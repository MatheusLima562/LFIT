import type { Metadata } from "next";
import Link from "next/link";
import { Dumbbell } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { planPeriod, planSituation } from "@/features/plans/format";
import { listActivePlans, type ActivePlanRow } from "@/features/plans/queries";
import { messages } from "@/messages/pt-BR";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";

const t = messages.plans.overview;

export const metadata: Metadata = { title: t.title };

function Situation({ row }: { row: ActivePlanRow }) {
  const s = planSituation(row.endsOn);
  if (!s) return <span className="text-[13px] text-ink-3">{t.noEnd}</span>;
  return (
    <span className={cn("text-[13px] whitespace-nowrap", s.kind === "expired" ? "font-medium text-red-700" : s.kind === "soon" ? "font-medium text-amber-800" : "text-ink-2")}>
      {s.label}
    </span>
  );
}

const columns: DataTableColumn<ActivePlanRow>[] = [
  {
    id: "student",
    header: t.columns.student,
    cell: (r) => (
      <Link href={`/alunos/${r.student.id}/treinos`} className="rounded font-semibold text-ink hover:text-brand-700 hover:underline">
        {r.student.name}
      </Link>
    ),
    className: "min-w-44",
  },
  {
    id: "plan",
    header: t.columns.plan,
    cell: (r) => (
      <Link href={`/treinos/${r.id}/editar`} className="rounded text-[13px] text-brand-700 hover:underline">
        {r.name}
      </Link>
    ),
  },
  { id: "period", header: t.columns.period, cell: (r) => <span className="text-[13px] whitespace-nowrap text-ink-2">{planPeriod(r.startsOn, r.endsOn)}</span>, hideBelow: "md" },
  { id: "situation", header: t.columns.situation, cell: (r) => <Situation row={r} /> },
];

export default async function PlansOverviewPage() {
  await requireStaff();
  const rows = await listActivePlans();
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-[22px]">{t.title}</h1>
          <p className="mt-0.5 text-[13px] text-ink-2">{t.subtitle}</p>
        </div>
        <Link href="/alunos?treino=sem_treino" className="rounded text-[13px] text-brand-700 hover:underline">
          {t.seeStudents}
        </Link>
      </header>
      {rows.length === 0 ? (
        <EmptyState icon={<Dumbbell />} message={t.empty} className="min-h-48 bg-surface" />
      ) : (
        <DataTable columns={columns} rows={rows} getRowId={(r) => r.id} caption={t.title} />
      )}
    </div>
  );
}
