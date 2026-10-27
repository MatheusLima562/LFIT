import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, ChevronRight, ClipboardList, Clock, Flame, Megaphone, MessageCircle, MessageSquareReply } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { itemSummary } from "@/features/student-app/format";
import { consistency, greeting, workoutDayLabel } from "@/features/student-app/humanize";
import { StartWorkoutButton } from "@/features/student-app/components/StartWorkoutButton";
import { TrainerAvatar } from "@/features/student-app/components/TrainerAvatar";
import { getMyActivePlan, getMyAnnouncement, getMyHistory, getMyProfile } from "@/features/student-app/queries";
import type { AppHistoryEntry, AppProfile, AppWorkout } from "@/features/student-app/types";
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

const REPLY_RECENT_DAYS = 14;

/** Resposta do professor a um treino recente (a mais nova), para o aviso na Hoje. O texto fica no Histórico. */
function recentReply(history: AppHistoryEntry[], now = new Date()): AppHistoryEntry | null {
  const since = now.getTime() - REPLY_RECENT_DAYS * 86_400_000;
  return history.find((h) => h.coach_reply && new Date(h.started_at).getTime() >= since) ?? null;
}

/** Saudação + constância em destaque (sem cobrança: com zero, um convite). */
function Hello({ profile }: { profile: AppProfile }) {
  const c = consistency(profile.sessions_this_month, profile.week_streak);
  return (
    <section aria-labelledby="hello" className="flex flex-col gap-3">
      <h1 id="hello" className="text-xl font-semibold tracking-tight text-ink">
        {greeting(profile.first_name)}
      </h1>
      <div className="flex items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-canvas text-ink-2 ring-1 ring-line">
          <Flame className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-3">{t.today.consistencyTitle}</p>
          <p className="text-[15px] font-semibold text-ink">{c.headline}</p>
          {c.detail && <p className="text-[13px] text-ink-2">{c.detail}</p>}
        </div>
      </div>
    </section>
  );
}

function Announcement({ body }: { body: string }) {
  return (
    <section aria-labelledby="recado" className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <h2 id="recado" className="flex items-center gap-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">
        <Megaphone aria-hidden className="size-4" />
        {t.today.announcement}
      </h2>
      <p className="mt-1.5 text-[15px] whitespace-pre-line text-ink">{body}</p>
    </section>
  );
}

function ReplyNotice({ entry }: { entry: AppHistoryEntry }) {
  return (
    <Link
      href="/aluno/historico"
      className="flex items-center gap-3 rounded-2xl bg-info-soft p-4 text-info-ink ring-1 ring-info-line outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <MessageSquareReply aria-hidden className="size-5 shrink-0" />
      <span className="min-w-0 flex-1 text-sm font-medium">{t.today.coachReply(workoutDayLabel(entry.started_at))}</span>
      <span className="link shrink-0 text-sm">{t.today.coachReplyLink}</span>
    </Link>
  );
}

function TrainerCard({ profile }: { profile: AppProfile }) {
  return (
    <section aria-labelledby="trainer" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-3">
        <TrainerAvatar name={profile.trainer_name ?? profile.organization_name} />
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-3">{profile.trainer_name ? t.today.trainerTitle : t.today.noTrainer}</p>
          <h2 id="trainer" className="text-[15px] font-semibold text-ink">
            {profile.trainer_name ?? profile.organization_name}
          </h2>
          {profile.trainer_office_hours && (
            <p className="flex items-center gap-1 text-xs text-ink-2">
              <Clock aria-hidden className="size-3.5 shrink-0 text-ink-3" />
              <span>{t.today.officeHours(profile.trainer_office_hours)}</span>
            </p>
          )}
        </div>
      </div>
      <Button asChild variant="outline" className="h-11 w-full">
        <Link href="/aluno/chat">
          <MessageCircle aria-hidden />
          {t.today.message}
        </Link>
      </Button>
    </section>
  );
}

export default async function StudentTodayPage() {
  // A página roda em paralelo ao layout: com acesso suspenso a RPC recusa e quem mostra a tela é o layout.
  const [profile, active, announcement, history] = await Promise.all([
    getMyProfile(),
    getMyActivePlan().catch(() => null),
    getMyAnnouncement(),
    getMyHistory(),
  ]);
  const reply = recentReply(history);
  const humane = profile && (
    <>
      <Hello profile={profile} />
      {announcement && <Announcement body={announcement.body} />}
      {reply && <ReplyNotice entry={reply} />}
    </>
  );

  if (!active) {
    return (
      <div className="flex flex-col gap-5">
        {humane}
        <section className="flex flex-col items-center px-4 pt-6 text-center">
          <span aria-hidden className="grid size-14 place-items-center rounded-full bg-surface text-ink-3 ring-1 ring-line">
            <ClipboardList className="size-7" />
          </span>
          {!profile && <h1 className="mt-5 text-lg font-semibold text-ink">{t.today.title}</h1>}
          <p className="mt-4 text-sm text-ink-2">{t.today.noPlan}</p>
        </section>
        {profile && <TrainerCard profile={profile} />}
      </div>
    );
  }

  const { plan, workouts } = active;
  const open = active.open_session;
  const suggested = workouts.find((w) => w.id === (open?.workout_id ?? active.suggested_workout_id)) ?? workouts[0];
  const others = workouts.filter((w) => w.id !== suggested?.id);
  const total = plan.planned_sessions;

  return (
    <div className="flex flex-col gap-5">
      {humane}
      <section>
        {profile ? (
          <h2 className="text-lg font-semibold tracking-tight text-ink">{plan.name}</h2>
        ) : (
          <h1 className="text-xl font-semibold tracking-tight text-ink">{plan.name}</h1>
        )}
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

      {profile && <TrainerCard profile={profile} />}

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
