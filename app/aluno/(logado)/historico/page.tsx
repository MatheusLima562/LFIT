import type { Metadata } from "next";
import Link from "next/link";
import { History, UserRound } from "lucide-react";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getMyHistory } from "@/features/student-app/queries";
import { messages } from "@/messages/pt-BR";

const t = messages.aluno;

export const metadata: Metadata = { title: t.history.title };

const TONE = {
  completed: "bg-success-soft text-success-ink ring-success-line",
  abandoned: "bg-canvas text-ink-3 ring-line",
  in_progress: "bg-info-soft text-info-ink ring-info-line",
} as const;

export default async function StudentHistoryPage() {
  const history = await getMyHistory();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight text-ink">{t.history.title}</h1>
      {history.length === 0 ? (
        <div className="flex flex-col items-center gap-3 pt-10 text-center">
          <History aria-hidden className="size-8 text-ink-3" />
          <p className="text-sm text-ink-2">{t.history.empty}</p>
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {history.map((h) => {
            const body = (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-ink">
                      {h.workout_label} · {h.workout_name || `Treino ${h.workout_label}`}
                    </p>
                    <p className="text-xs text-ink-3">
                      {formatDate(h.started_at)}
                      {h.plan_name && ` · ${h.plan_name}`}
                    </p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", TONE[h.status])}>
                    {t.history.status[h.status]}
                  </span>
                </div>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
                  <span>{t.history.exercises(h.exercises_done)}</span>
                  {h.rpe && <span>{t.history.rpe(h.rpe)}</span>}
                  {h.by_trainer && (
                    <span className="flex items-center gap-1 text-ink-3">
                      <UserRound aria-hidden className="size-3.5" />
                      {t.run.byTrainer}
                    </span>
                  )}
                </p>
              </>
            );
            return (
              <li key={h.session_id}>
                {h.status === "in_progress" ? (
                  <Link
                    href={`/aluno/treino/${h.session_id}`}
                    className="block rounded-2xl border border-line bg-surface p-4 shadow-card outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
