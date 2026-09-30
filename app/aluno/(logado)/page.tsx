import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, ChevronRight, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { itemSummary } from "@/features/student-app/format";
import { StartWorkoutButton } from "@/features/student-app/components/StartWorkoutButton";
import { getMyActivePlan, getMyProfile } from "@/features/student-app/queries";
import type { AppWorkout } from "@/features/student-app/types";
import { messages } from "@/messages/pt-BR";

const t = messages.aluno;

export const metadata: Metadata = { title: t.nav.today };

function WorkoutTitle({ w }: { w: AppWorkout }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-canvas text-sm font-bold text-ink ring-1 ring-line">{w.label}</span>
      <span className="min-w-0 truncate text-[15px] font-semibold text-ink">{w.name || `Treino ${w.label}`}</span>
    </span>
  );
}

export default async function StudentTodayPage() {
  // A página roda em paralelo ao layout: com acesso suspenso a RPC recusa e quem mostra a tela é o layout.
  const [profile, active] = await Promise.all([getMyProfile(), getMyActivePlan().catch(() => null)]);

  if (!active) {
    return (
      <section className="flex flex-col items-center px-4 pt-14 text-center">
        <span aria-hidden className="grid size-14 place-items-center rounded-full bg-surface text-ink-3 ring-1 ring-line">
          <ClipboardList className="size-7" />
        </span>
        <h1 className="mt-5 text-lg font-semibold text-ink">{profile ? t.greeting(profile.first_name) : t.today.title}</h1>
        <p className="mt-2 text-sm text-ink-2">{t.today.noPlan}</p>
      </section>
    );
  }

  const { plan, workouts } = active;
  const open = active.open_session;
  const suggested = workouts.find((w) => w.id === (open?.workout_id ?? active.suggested_workout_id)) ?? workouts[0];
  const others = workouts.filter((w) => w.id !== suggested?.id);
  const total = plan.planned_sessions;

  return (
    <div className="flex flex-col gap-5">
      <section>
        <p className="text-sm text-ink-2">{profile ? t.greeting(profile.first_name) : null}</p>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{plan.name}</h1>
        {profile && <p className="text-xs text-ink-3">{t.trainerLine(profile.trainer_name, profile.organization_name)}</p>}
        <div className="mt-3 flex items-center gap-3">
          <CalendarCheck aria-hidden className="size-4 shrink-0 text-ink-3" />
          <p className="text-[13px] text-ink-2">{t.today.progress(plan.completed_sessions, total)}</p>
        </div>
        {total ? <ProgressBar value={plan.completed_sessions} max={total} label={t.today.progress(plan.completed_sessions, total)} className="mt-2" /> : null}
      </section>

      {suggested && (
        <section aria-labelledby="today-title" className="rounded-2xl border border-line bg-surface p-4 shadow-card">
          <p id="today-title" className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">
            {open ? t.today.resume : t.today.suggested}
          </p>
          <WorkoutTitle w={suggested} />
          <ol className="mt-3 flex flex-col divide-y divide-line">
            {suggested.items.map((it) => (
              <li key={it.id} className="py-2">
                <p className="text-[14px] font-medium text-ink">{it.exercise.name}</p>
                <p className="text-xs text-ink-3">{itemSummary(it)}</p>
              </li>
            ))}
          </ol>
          <div className="mt-4">
            {open && open.workout_id === suggested.id ? (
              <Button asChild size="lg" className="h-12 w-full text-base">
                <Link href={`/aluno/treino/${open.id}`}>{t.today.resume}</Link>
              </Button>
            ) : (
              <StartWorkoutButton planId={plan.id} workoutId={suggested.id} />
            )}
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section aria-labelledby="others-title" className="flex flex-col gap-2">
          <h2 id="others-title" className="text-xs font-semibold tracking-wide text-ink-3 uppercase">
            {t.today.otherWorkouts}
          </h2>
          {others.map((w) => (
            <details key={w.id} className="group rounded-2xl border border-line bg-surface shadow-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                <WorkoutTitle w={w} />
                <span className="flex items-center gap-1 text-xs text-ink-3">
                  {t.today.exercises(w.items.length)}
                  <ChevronRight aria-hidden className="size-4 transition-transform group-open:rotate-90" />
                </span>
              </summary>
              <div className="border-t border-line px-4 pt-2 pb-4">
                <ol className="flex flex-col divide-y divide-line">
                  {w.items.map((it) => (
                    <li key={it.id} className="py-2">
                      <p className="text-[14px] font-medium text-ink">{it.exercise.name}</p>
                      <p className="text-xs text-ink-3">{itemSummary(it)}</p>
                    </li>
                  ))}
                </ol>
                <div className="mt-3">
                  <StartWorkoutButton planId={plan.id} workoutId={w.id} label={`${t.today.start} ${w.label}`} variant="outline" />
                </div>
              </div>
            </details>
          ))}
        </section>
      )}

      {plan.notes && (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{t.today.planNotes}</h2>
          <p className="mt-1 text-sm whitespace-pre-line text-ink-2">{plan.notes}</p>
        </section>
      )}
    </div>
  );
}
