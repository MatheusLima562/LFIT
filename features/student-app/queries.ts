import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/db/server";
import { exerciseMediaUrl } from "@/lib/media";
import type { AppActivePlan, AppExercise, AppHistoryEntry, AppProfile, AppTrainingSession, AppWorkout } from "./types";

/** Perfil seguro do aluno logado (RPC; a tabela `students` não é exposta ao aluno). Memorizado por requisição. */
export const getMyProfile = cache(async (): Promise<AppProfile | null> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_my_student_profile");
  return (data?.[0] as AppProfile | undefined) ?? null;
});

export async function getMyConsentRequest() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_my_health_consent_request");
  return data?.[0] ?? null;
}

/**
 * Vídeo/pôster próprios: URL assinada com a secret key, SÓ depois de a RPC (com a sessão do usuário) ter autorizado a
 * leitura da divisão — mesmo modelo de `lib/media.ts`.
 */
async function withMedia(e: AppExercise): Promise<AppExercise> {
  const [video_src, poster_src] = await Promise.all([exerciseMediaUrl(e.video_path), exerciseMediaUrl(e.poster_path)]);
  return { ...e, video_src, poster_src };
}

async function workoutWithMedia(w: AppWorkout): Promise<AppWorkout> {
  return {
    ...w,
    items: await Promise.all(
      w.items.map(async (it) => ({
        ...it,
        exercise: await withMedia(it.exercise),
        substitutes: await Promise.all(it.substitutes.map(withMedia)),
      })),
    ),
  };
}

/** Plano ativo (null = sem plano). Lança o código da RPC (ex.: ACCESS_SUSPENDED). */
export async function getMyActivePlan(studentId?: string): Promise<AppActivePlan | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_active_plan", studentId ? { p_student_id: studentId } : {});
  if (error) throw new Error(error.message);
  return (data as unknown as AppActivePlan | null) ?? null;
}

/** Sessão para a tela de execução (cópia da divisão + registros), com as URLs de vídeo. Null se não existir/sem acesso. */
export async function getTrainingSession(sessionId: string): Promise<AppTrainingSession | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_training_session", { p_session_id: sessionId });
  if (error || !data) return null;
  const s = data as unknown as AppTrainingSession;
  return { ...s, workout: await workoutWithMedia(s.workout) };
}

export async function getMyHistory(): Promise<AppHistoryEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_my_workout_history");
  return (data ?? []) as AppHistoryEntry[];
}
