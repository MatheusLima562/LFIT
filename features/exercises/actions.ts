"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
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
