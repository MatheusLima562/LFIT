"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Copy, Pencil, ShieldAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { customizeExercise, setExerciseArchived } from "../actions";
import type { ExerciseDetail } from "../queries";
import { LevelBadge } from "./LevelBadge";
import { VideoEmbed } from "./VideoEmbed";

const t = messages.exercises;

interface Props {
  exercise: ExerciseDetail | null;
  closeHref: string;
}

export function ExerciseDetailDialog({ exercise, closeHref }: Props) {
  const editHref = (id: string) => `${closeHref}${closeHref.includes("?") ? "&" : "?"}editar=${id}`;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const close = () => router.replace(closeHref, { scroll: false });

  const run = (fn: () => Promise<{ ok: true; id: string; message: string } | { ok: false; error: string }>, then?: (id: string) => void) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      if (then) then(r.id);
      else close();
    });

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && close()}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 p-0 sm:max-w-xl">
        {!exercise ? (
          <DialogHeader className="px-6 py-5">
            <DialogTitle>{t.notFound}</DialogTitle>
          </DialogHeader>
        ) : (
          <>
            <DialogHeader className="border-b border-line px-5 py-4 sm:px-6">
              <DialogTitle>{exercise.name}</DialogTitle>
              <DialogDescription>
                {exercise.muscleGroups.map((g) => messages.muscleGroups[g]).join(", ")}
                {exercise.equipment ? ` · ${exercise.equipment}` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4 sm:px-6">
              <p className="text-xs text-ink-3">
                {exercise.isGlobal ? t.origin.global : exercise.customizedFrom ? t.customizedFrom : t.origin.own}
                {exercise.archived ? ` · ${t.archivedBadge}` : ""}
              </p>
              <section>
                <h3 className="mb-1.5 text-sm font-semibold text-ink">{t.instructions}</h3>
                <p className="text-[13px] whitespace-pre-line text-ink-2">{exercise.instructions ?? t.noInstructions}</p>
              </section>
              {exercise.videoUrl && (
                <section>
                  <h3 className="mb-1.5 text-sm font-semibold text-ink">{t.video}</h3>
                  <VideoEmbed url={exercise.videoUrl} title={exercise.name} />
                </section>
              )}
              <section>
                <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <ShieldAlert aria-hidden className="size-4 text-ink-3" />
                  {t.rules.title}
                </h3>
                {exercise.rules.length === 0 ? (
                  <p className="text-[13px] text-ink-3">{t.noRules}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {exercise.rules.map((r) => (
                      <li key={`${r.conditionId}-${r.isGlobal}`} className="rounded-xl border border-line px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <LevelBadge level={r.level} />
                          <span className="text-[13px] font-medium text-ink">{r.conditionName}</span>
                          <span className="ml-auto text-[11px] text-ink-3">{r.isGlobal ? t.globalBadge : t.ownBadge}</span>
                        </div>
                        {r.note && <p className="mt-1 text-[13px] text-ink-2">{r.note}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
            <DialogFooter className="flex-wrap border-t border-line px-5 py-3 sm:px-6">
              {exercise.isGlobal && (
                <Button
                  variant="outline"
                  disabled={pending}
                  title={t.customizeHint}
                  onClick={() => run(() => customizeExercise(exercise.id), (id) => router.replace(editHref(id), { scroll: false }))}
                >
                  <Copy aria-hidden />
                  {t.customize}
                </Button>
              )}
              {exercise.canEdit && (
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => (exercise.archived ? run(() => setExerciseArchived(exercise.id, false)) : setConfirmArchive(true))}
                >
                  {exercise.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
                  {exercise.archived ? t.unarchive : t.archive}
                </Button>
              )}
              {(exercise.isGlobal || exercise.canEdit) && !exercise.archived && (
                <Button asChild>
                  <Link href={editHref(exercise.id)} scroll={false} replace>
                    <Pencil aria-hidden />
                    {exercise.isGlobal ? t.editRules : t.edit}
                  </Link>
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
      {exercise && (
        <ConfirmDialog
          open={confirmArchive}
          onOpenChange={setConfirmArchive}
          title={t.archiveTitle}
          description={t.archiveText(exercise.name)}
          confirmLabel={t.archive}
          cancelLabel={messages.students.confirm.cancel}
          pending={pending}
          onConfirm={() => run(() => setExerciseArchived(exercise.id, true))}
        />
      )}
    </Dialog>
  );
}
