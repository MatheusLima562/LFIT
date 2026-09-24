import type { Metadata } from "next";
import Link from "next/link";
import { Dumbbell, Plus, SearchX } from "lucide-react";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { getExerciseDefaults, getExerciseDetail, getExerciseFilterOptions, getVideoUsage, listExercises } from "@/features/exercises/queries";
import { VideoUsageBar } from "@/features/exercises/components/VideoUsageBar";
import { exerciseListHref, parseExerciseListParams } from "@/features/exercises/search-params";
import { ExerciseDetailDialog } from "@/features/exercises/components/ExerciseDetailDialog";
import { ExerciseFormDialog } from "@/features/exercises/components/ExerciseFormDialog";
import { ExercisesList, ExercisesPagination } from "@/features/exercises/components/ExercisesList";
import { ExercisesToolbar } from "@/features/exercises/components/ExercisesToolbar";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";

const t = messages.exercises;

export const metadata: Metadata = { title: t.title };

/** Diálogos controlados pela URL: ?ver=<id>, ?editar=<id> ou ?novo=1. */
function parseDialog(raw: Record<string, string | string[] | undefined>) {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const edit = z.uuid().safeParse(first(raw.editar));
  if (edit.success) return { mode: "edit" as const, id: edit.data };
  const view = z.uuid().safeParse(first(raw.ver));
  if (view.success) return { mode: "view" as const, id: view.data };
  if (first(raw.novo) === "1") return { mode: "create" as const, id: null };
  return null;
}

export default async function ExercisesPage({ searchParams }: PageProps<"/treinos/exercicios">) {
  const session = await requireStaff();
  const raw = await searchParams;
  const params = parseExerciseListParams(raw);
  const dialog = parseDialog(raw);
  const listHref = exerciseListHref(params);

  const [{ rows, total }, options, detail, videoUsage] = await Promise.all([
    listExercises(params),
    getExerciseFilterOptions(),
    dialog?.id ? getExerciseDetail(dialog.id, session) : Promise.resolve(null),
    getVideoUsage(),
  ]);
  const defaults = dialog?.mode === "edit" && dialog.id ? await getExerciseDefaults(dialog.id) : undefined;
  const filtered = Boolean(params.q || params.grupo || params.equip || params.condicao);
  // Sem permissão para editar → mostra a ficha em vez do formulário.
  const editable = detail && (detail.isGlobal || detail.canEdit) && !detail.archived;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-[22px]">{t.title}</h1>
          <p className="mt-0.5 max-w-2xl text-[13px] text-ink-2">{t.subtitle}</p>
        </div>
        <Button asChild>
          <Link href={exerciseListHref(params, { novo: "1" })} scroll={false}>
            <Plus aria-hidden />
            {t.new}
          </Link>
        </Button>
      </header>

      <VideoUsageBar usage={videoUsage} />

      <ExercisesToolbar params={params} equipment={options.equipment} conditions={options.conditions} />

      {rows.length === 0 ? (
        <EmptyState
          icon={filtered ? <SearchX /> : <Dumbbell />}
          message={filtered ? t.empty.search : params.origem === "archived" ? t.empty.archived : t.empty.all}
          className="min-h-64 bg-surface"
        />
      ) : (
        <>
          <ExercisesList rows={rows} params={params} />
          <ExercisesPagination params={params} total={total} />
        </>
      )}

      {dialog?.mode === "view" && (
        <ExerciseDetailDialog key={dialog.id} exercise={detail} closeHref={listHref} isOwner={session.role === "owner"} />
      )}
      {dialog?.mode === "edit" && !editable && (
        <ExerciseDetailDialog key={dialog.id} exercise={detail} closeHref={listHref} isOwner={session.role === "owner"} />
      )}
      {(dialog?.mode === "create" || (dialog?.mode === "edit" && editable)) && (
        <ExerciseFormDialog
          key={dialog.id ?? "novo"}
          exercise={dialog.mode === "edit" ? detail : null}
          conditions={options.conditions}
          equipment={options.equipment}
          closeHref={listHref}
          organizationId={session.organizationId}
          videoQuotaBytes={videoUsage.quotaBytes}
          videoUsedBytes={videoUsage.usedBytes}
          exerciseDefaults={defaults}
        />
      )}
    </div>
  );
}
