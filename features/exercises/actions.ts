"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { exerciseDefaultsSchema } from "./defaults";
import { exerciseFormSchema } from "./schemas";

const t = messages.exercises;
export type ExerciseActionResult = { ok: true; id: string; message: string } | { ok: false; error: string; field?: "name" };

async function staffOrError() {
  const session = await getSession();
  return session && session.role !== "student" ? session : null;
}

function revalidate() {
  revalidatePath("/treinos/exercicios");
}

/**
 * Cria/edita um exercício próprio ou, em exercício global, só a camada de
 * contraindicações da equipe (RPC save_exercise, SECURITY INVOKER: RLS vale).
 */
export async function saveExercise(input: unknown, id?: string): Promise<ExerciseActionResult> {
  if (id && !z.uuid().safeParse(id).success) return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  const parsed = exerciseFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? messages.dbErrors.INVALID_INPUT };
  if (!(await staffOrError())) return { ok: false, error: messages.dbErrors.FORBIDDEN };

  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_exercise", {
    // null = novo (os tipos gerados não marcam argumentos SQL como anuláveis)
    p_id: id ?? (null as unknown as string),
    p_data: {
      name: v.name,
      muscle_groups: v.muscleGroups,
      equipment: v.equipment,
      instructions: v.instructions,
      video_url: v.videoUrl,
    },
    p_rules: v.rules.map((r) => ({ condition_id: r.conditionId, level: r.level, note: r.note })),
  });
  if (error?.code === "23505") return { ok: false, error: t.exists, field: "name" };
  if (error || !data) return { ok: false, error: dbErrorMessage(error) };
  revalidate();
  return { ok: true, id: data, message: id ? t.saved : t.created };
}

export async function customizeExercise(id: string): Promise<ExerciseActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  if (!(await staffOrError())) return { ok: false, error: messages.dbErrors.FORBIDDEN };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customize_exercise", { p_id: id });
  if (error?.code === "23505") return { ok: false, error: t.exists };
  if (error || !data) return { ok: false, error: dbErrorMessage(error) };
  revalidate();
  return { ok: true, id: data, message: t.customized };
}

export async function setExerciseArchived(id: string, archived: boolean): Promise<ExerciseActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  if (!(await staffOrError())) return { ok: false, error: messages.dbErrors.FORBIDDEN };
  const supabase = await createClient();
  // RLS: só exercícios próprios, owner ou autor; sem permissão afeta 0 linhas.
  const { data, error } = await supabase
    .from("exercises")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id");
  if (error?.code === "23505") return { ok: false, error: t.exists };
  if (error) return { ok: false, error: dbErrorMessage(error) };
  if (!data?.length) return { ok: false, error: t.readOnlyOther };
  revalidate();
  return { ok: true, id, message: archived ? t.archived : t.unarchived };
}

// ---------------------------------------------------------------------------
// Vídeo próprio (arquivo no bucket exercise-media)
// ---------------------------------------------------------------------------

const MEDIA_BUCKET = "exercise-media";

export type VideoQuotaResult = { ok: true } | { ok: false; error: string; quota: true };

/** Checagem prévia da cota (evita subir um arquivo que o banco recusaria). O gatilho reconfere. */
export async function checkVideoQuota(exerciseId: string, bytes: number): Promise<VideoQuotaResult> {
  if (!z.uuid().safeParse(exerciseId).success || !Number.isFinite(bytes) || bytes < 0) return { ok: false, error: messages.dbErrors.INVALID_INPUT, quota: true };
  const supabase = await createClient();
  const [{ data: usage }, { data: ex }] = await Promise.all([
    supabase.rpc("organization_video_usage").single(),
    supabase.from("exercises").select("media_bytes").eq("id", exerciseId).maybeSingle(),
  ]);
  if (!usage) return { ok: false, error: messages.dbErrors.FORBIDDEN, quota: true };
  const used = Number(usage.used_bytes) - Number(ex?.media_bytes ?? 0);
  if (used + bytes > Number(usage.quota_bytes)) return { ok: false, error: t.media.errors.quota, quota: true };
  return { ok: true };
}

const mediaPath = (orgId: string, exerciseId: string, exts: string) => new RegExp(`^${orgId}/${exerciseId}/[0-9a-f-]{36}\\.(${exts})$`);

/**
 * Grava os caminhos já enviados pelo cliente. O gatilho valida tipo/tamanho/cota lendo o
 * Storage. Falhou → apaga os arquivos novos; deu certo → apaga os antigos (sem órfãos).
 */
export async function setExerciseVideo(exerciseId: string, videoPath: string, posterPath: string | null): Promise<ExerciseActionResult> {
  const session = await staffOrError();
  if (!session || !z.uuid().safeParse(exerciseId).success) return { ok: false, error: messages.dbErrors.FORBIDDEN };
  const supabase = await createClient();
  const cleanupNew = () => supabase.storage.from(MEDIA_BUCKET).remove([videoPath, ...(posterPath ? [posterPath] : [])]);
  if (!mediaPath(session.organizationId, exerciseId, "mp4|webm").test(videoPath) || (posterPath && !mediaPath(session.organizationId, exerciseId, "jpg|webp").test(posterPath))) {
    await cleanupNew();
    return { ok: false, error: messages.dbErrors.INVALID_MEDIA };
  }

  const { data: old } = await supabase.from("exercises").select("video_path, poster_path").eq("id", exerciseId).maybeSingle();
  const { data, error } = await supabase
    .from("exercises")
    .update({ video_path: videoPath, poster_path: posterPath })
    .eq("id", exerciseId)
    .select("id");
  if (error || !data?.length) {
    await cleanupNew();
    return { ok: false, error: error ? dbErrorMessage(error) : t.readOnlyOther };
  }
  const stale = [old?.video_path, old?.poster_path].filter((p): p is string => Boolean(p) && p !== videoPath && p !== posterPath);
  if (stale.length) await supabase.storage.from(MEDIA_BUCKET).remove(stale);
  revalidate();
  return { ok: true, id: exerciseId, message: t.media.saved };
}

export async function removeExerciseVideo(exerciseId: string): Promise<ExerciseActionResult> {
  if (!(await staffOrError()) || !z.uuid().safeParse(exerciseId).success) return { ok: false, error: messages.dbErrors.FORBIDDEN };
  const supabase = await createClient();
  const { data: old } = await supabase.from("exercises").select("video_path, poster_path").eq("id", exerciseId).maybeSingle();
  // O gatilho zera poster_path e media_bytes junto.
  const { data, error } = await supabase.from("exercises").update({ video_path: null }).eq("id", exerciseId).select("id");
  if (error || !data?.length) return { ok: false, error: error ? dbErrorMessage(error) : t.readOnlyOther };
  const stale = [old?.video_path, old?.poster_path].filter((p): p is string => Boolean(p));
  if (stale.length) await supabase.storage.from(MEDIA_BUCKET).remove(stale);
  revalidate();
  return { ok: true, id: exerciseId, message: t.media.removed };
}

/** Exclusão definitiva (só owner, RLS). Apaga o vídeo depois que a linha foi excluída. */
export async function deleteExercise(exerciseId: string): Promise<ExerciseActionResult> {
  const session = await staffOrError();
  if (!session || session.role !== "owner" || !z.uuid().safeParse(exerciseId).success) return { ok: false, error: messages.dbErrors.FORBIDDEN };
  const supabase = await createClient();
  const { data: old } = await supabase.from("exercises").select("video_path, poster_path").eq("id", exerciseId).maybeSingle();
  const { data, error } = await supabase.from("exercises").delete().eq("id", exerciseId).select("id");
  if (error?.code === "23503") return { ok: false, error: t.inUse };
  if (error || !data?.length) return { ok: false, error: dbErrorMessage(error) };
  // A linha (que autorizava o acesso à pasta) já não existe: remoção com a secret key, depois do RLS autorizar a exclusão.
  const stale = [old?.video_path, old?.poster_path].filter((p): p is string => Boolean(p));
  if (stale.length) await createAdminClient().storage.from(MEDIA_BUCKET).remove(stale);
  revalidate();
  return { ok: true, id: exerciseId, message: t.deleted };
}

/**
 * Padrões da equipe para o exercício (camada da org). Tudo vazio = remove a camada da equipe
 * (volta ao padrão LFit). RLS: exercício global → qualquer staff; próprio → owner ou autor.
 */
export async function saveExerciseDefaults(exerciseId: string, input: unknown): Promise<ExerciseActionResult> {
  const session = await staffOrError();
  if (!session || !z.uuid().safeParse(exerciseId).success) return { ok: false, error: messages.dbErrors.FORBIDDEN };
  const supabase = await createClient();
  if (input === null) {
    const { error } = await supabase.from("exercise_defaults").delete().eq("exercise_id", exerciseId).eq("organization_id", session.organizationId);
    if (error) return { ok: false, error: dbErrorMessage(error) };
    revalidate();
    return { ok: true, id: exerciseId, message: t.defaults.saved };
  }
  const parsed = exerciseDefaultsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? messages.dbErrors.INVALID_INPUT };
  const d = parsed.data;
  const row = { sets: d.sets, quantity_unit: d.quantityUnit, quantity_min: d.quantityMin, quantity_max: d.quantityMax, rest_min: d.restMin, rest_max: d.restMax };
  const { data: existing } = await supabase.from("exercise_defaults").select("id").eq("exercise_id", exerciseId).eq("organization_id", session.organizationId).maybeSingle();
  const { error } = existing
    ? await supabase.from("exercise_defaults").update(row).eq("id", existing.id)
    : await supabase.from("exercise_defaults").insert({ ...row, organization_id: session.organizationId, exercise_id: exerciseId });
  if (error) return { ok: false, error: dbErrorMessage(error) };
  revalidate();
  return { ok: true, id: exerciseId, message: t.defaults.saved };
}
