import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import type { ExerciseRow } from "../queries";
import { EXERCISE_PAGE_SIZE, exerciseListHref, type ExerciseListParams } from "../search-params";
import { LevelBadge } from "./LevelBadge";

const t = messages.exercises;

function OriginBadge({ row }: { row: ExerciseRow }) {
  return (
    <span className="flex flex-wrap gap-1">
      <span
        className={cn(
          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
          row.isGlobal ? "bg-canvas text-ink-2 ring-line" : "bg-brand-50 text-brand-700 ring-brand-200",
        )}
      >
        {row.isGlobal ? t.globalBadge : t.ownBadge}
      </span>
      {row.archived && <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">{t.archivedBadge}</span>}
    </span>
  );
}

function Rules({ row }: { row: ExerciseRow }) {
  if (!row.rules.avoid && !row.rules.caution) return <span className="text-[13px] text-ink-3">{t.noRules}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {row.rules.avoid > 0 && <LevelBadge level="avoid">{`${t.levels.avoid} · ${row.rules.avoid}`}</LevelBadge>}
      {row.rules.caution > 0 && <LevelBadge level="caution">{`${t.levels.caution} · ${row.rules.caution}`}</LevelBadge>}
    </span>
  );
}

const muscles = (row: ExerciseRow) => row.muscleGroups.map((g) => messages.muscleGroups[g]).join(", ");

export function ExercisesList({ rows, params }: { rows: ExerciseRow[]; params: ExerciseListParams }) {
  const detailHref = (id: string) => exerciseListHref(params, { ver: id });
  const name = (row: ExerciseRow) => (
    <Link href={detailHref(row.id)} scroll={false} className="rounded font-semibold text-ink hover:text-brand-700 hover:underline">
      {row.name}
    </Link>
  );

  const columns: DataTableColumn<ExerciseRow>[] = [
    { id: "name", header: t.columns.name, cell: name, className: "min-w-52 text-[14px]" },
    { id: "muscles", header: t.columns.muscles, cell: (r) => <span className="text-[13px] text-ink-2">{muscles(r)}</span>, hideBelow: "lg" },
    { id: "equipment", header: t.columns.equipment, cell: (r) => <span className="text-[13px] text-ink-2">{r.equipment ?? "—"}</span>, hideBelow: "xl" },
    { id: "origin", header: t.columns.origin, cell: (r) => <OriginBadge row={r} /> },
    { id: "rules", header: t.columns.rules, cell: (r) => <Rules row={r} /> },
  ];

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 shadow-card">
            <div className="flex items-start justify-between gap-2">
              {name(r)}
              <OriginBadge row={r} />
            </div>
            <p className="text-[13px] text-ink-2">{muscles(r)}</p>
            {r.equipment && <p className="text-[13px] text-ink-3">{r.equipment}</p>}
            <Rules row={r} />
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <DataTable columns={columns} rows={rows} getRowId={(r) => r.id} caption={t.title} />
      </div>
    </>
  );
}

export function ExercisesPagination({ params, total }: { params: ExerciseListParams; total: number }) {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / EXERCISE_PAGE_SIZE));
  const from = (params.page - 1) * EXERCISE_PAGE_SIZE + 1;
  const to = Math.min(params.page * EXERCISE_PAGE_SIZE, total);
  const link = (page: number, label: string, icon: React.ReactNode, disabled: boolean) =>
    disabled ? (
      <span aria-disabled="true" className={cn(buttonVariants({ variant: "outline", size: "icon" }), "pointer-events-none opacity-40")}>
        {icon}
        <span className="sr-only">{label}</span>
      </span>
    ) : (
      <Link href={exerciseListHref({ ...params, page })} aria-label={label} className={buttonVariants({ variant: "outline", size: "icon" })}>
        {icon}
      </Link>
    );
  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-3">
      <p className="tabular text-[13px] text-ink-2">{t.pagination(from, to, total)}</p>
      <div className="flex items-center gap-2">
        {link(params.page - 1, "Página anterior", <ChevronLeft aria-hidden />, params.page <= 1)}
        <span className="tabular text-[13px] text-ink-2">
          {params.page} / {pages}
        </span>
        {link(params.page + 1, "Próxima página", <ChevronRight aria-hidden />, params.page >= pages)}
      </div>
    </nav>
  );
}
