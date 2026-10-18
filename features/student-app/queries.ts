import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { exerciseMediaUrl } from "@/lib/media";
import type { SessionRecord } from "./humanize";

const PHOTO_BUCKET = "student-photos";
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

/** Recado do professor ainda válido (o mais recente) — null quando não há. */
export async function getMyAnnouncement(): Promise<{ body: string; created_at: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_announcement");
  // Sem recado, a função devolve a linha vazia (todos os campos nulos).
  if (error || !data?.id) return null;
  return { body: data.body, created_at: data.created_at };
}

export interface SessionDone {
  id: string;
  status: "in_progress" | "completed" | "abandoned";
  workout_label: string;
  workout_name: string | null;
  hasFeedback: boolean;
  rating: number | null;
  summary: { exercises_done: number; sets_done: number; records: SessionRecord[] };
}

/**
 * Resumo do fim do treino: sessão (RLS — só o titular lê aqui), resumo (`get_session_summary`) e a nota já dada.
 * O comentário nunca sai daqui: só o "houve comentário".
 */
export async function getSessionDone(sessionId: string): Promise<SessionDone | null> {
  const supabase = await createClient();
  const [session, summary, rating] = await Promise.all([
    supabase.from("workout_sessions").select("id, status, workout_label, workout_name, feedback_note").eq("id", sessionId).maybeSingle(),
    supabase.rpc("get_session_summary", { p_session_id: sessionId }),
    supabase.from("workout_sessions").select("student_rating").eq("id", sessionId).maybeSingle(),
  ]);
  if (session.error || !session.data || summary.error || !summary.data) return null;
  const s = session.data;
  return {
    id: s.id,
    status: s.status as SessionDone["status"],
    workout_label: s.workout_label,
    workout_name: s.workout_name,
    hasFeedback: Boolean(s.feedback_note),
    // Sem a coluna (migration da nota ainda não aplicada) a consulta falha: a tela segue, só sem nota prévia.
    rating: rating.error ? null : (rating.data?.student_rating ?? null),
    summary: summary.data as unknown as SessionDone["summary"],
  };
}

/**
 * Foto do próprio aluno: o caminho veio de `get_my_student_profile` (escopo auth.uid()), então já está autorizado; a
 * URL assinada sai com a secret key, como os vídeos.
 */
export async function getMyPhotoUrl(photoPath: string | null): Promise<string | null> {
  if (!photoPath) return null;
  const { data } = await createAdminClient().storage.from(PHOTO_BUCKET).createSignedUrl(photoPath, 60 * 60);
  return data?.signedUrl ?? null;
}
