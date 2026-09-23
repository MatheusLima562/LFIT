import { Medal, Trophy } from "lucide-react";
import type { TopStudent } from "@/types/dashboard";
import { cn } from "@/lib/utils";
import { formatNumber, plural } from "@/lib/format";
import { Avatar } from "@/components/ui/Avatar";
import { Card, CardFooter, CardHeader, CardIcon } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

const RANK_SLOTS = 5;

const rankStyles = [
  "bg-amber-100 text-amber-800 ring-amber-200",
  "bg-zinc-100 text-zinc-700 ring-zinc-200",
  "bg-orange-100 text-orange-800 ring-orange-200",
];

function RankBadge({ position, muted }: { position: number; muted?: boolean }) {
  return (
    <span
      className={cn(
        "tabular grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ring-1",
        muted ? "text-ink-3 ring-line" : (rankStyles[position - 1] ?? "bg-canvas text-ink-2 ring-line"),
      )}
    >
      {position}
    </span>
  );
}

export function TopStudentsCard({ students }: { students: TopStudent[] }) {
  const best = students[0]?.workouts ?? 0;
  const openSlots = Math.max(RANK_SLOTS - students.length, 0);

  return (
    <Card labelledBy="card-top" className="h-full">
      <CardHeader id="card-top" title="Top 5 alunos" icon={<CardIcon><Trophy /></CardIcon>} />
      {students.length === 0 ? (
        <EmptyState icon={<Medal />} message="Nenhum treino marcado nos últimos 30 dias." />
      ) : (
        <ol className="flex flex-col gap-0.5">
          {students.map((student, i) => (
            <li key={student.id} className="flex h-10 items-center gap-2.5 rounded-lg px-1 transition-colors hover:bg-canvas">
              <RankBadge position={i + 1} />
              <Avatar name={student.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-ink">{student.name}</p>
                <div aria-hidden className="mt-1 h-1 overflow-hidden rounded-full bg-canvas">
                  <div className="h-full rounded-full bg-brand-400" style={{ width: `${(student.workouts / best) * 100}%` }} />
                </div>
              </div>
              <span
                aria-label={plural(student.workouts, "treino")}
                className="tabular min-w-7 shrink-0 rounded-md bg-brand-50 px-1.5 py-0.5 text-center text-xs font-semibold text-brand-700"
              >
                {formatNumber(student.workouts)}
              </span>
            </li>
          ))}
          {Array.from({ length: openSlots }, (_, i) => (
            <li key={`slot-${i}`} aria-hidden className="flex h-10 items-center gap-2.5 px-1">
              <RankBadge position={students.length + i + 1} muted />
              <span className="size-7 shrink-0 rounded-full border border-dashed border-line-strong" />
              <span className="text-xs text-ink-3">Posição disponível</span>
            </li>
          ))}
        </ol>
      )}
      <CardFooter>
        <p className="text-xs text-ink-3">Treinos marcados nos últimos 30 dias.</p>
      </CardFooter>
    </Card>
  );
}
