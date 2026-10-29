import "server-only";
import { createClient } from "@/lib/db/server";

export interface StaffAnnouncement {
  id: string;
  body: string;
  expiresAt: string;
  mine: boolean;
}

export interface CoachSession {
  id: string;
  startedAt: string;
  workoutLabel: string;
  workoutName: string | null;
  rpe: number | null;
  feedbackNote: string | null;
  coachReply: string | null;
}

/**
 * Recado que o aluno vê agora (`get_my_announcement` em modo staff). `null` = o chamador não acessa o aluno (professor só
 * do plano, outra equipe): a seção nem aparece.
 */
export async function getStudentAnnouncement(studentId: string, userId: string): Promise<{ current: StaffAnnouncement | null } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_announcement", { p_student_id: studentId });
  if (error) return null;
  const a = data as { id: string | null; body: string; expires_at: string; trainer_id: string } | null;
  return { current: a?.id ? { id: a.id, body: a.body, expiresAt: a.expires_at, mine: a.trainer_id === userId } : null };
}

/** Recado "para todos os meus alunos" ativo do próprio chamador (RLS: o autor lê os seus). */
export async function getMyBroadcast(userId: string): Promise<StaffAnnouncement | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("trainer_announcements")
    .select("id, body, expires_at")
    .eq("trainer_id", userId)
    .is("student_id", null)
    .eq("active", true)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id, body: data.body, expiresAt: data.expires_at, mine: true } : null;
}

/**
 * Últimas sessões concluídas, com comentário e resposta. Só para quem vê a saúde do aluno (o RLS de `workout_sessions`
 * exige `can_view_student_health`; a RPC de resposta também). Sem acesso: `canReply = false` e lista vazia.
 */
export async function getCoachSessions(studentId: string): Promise<{ canReply: boolean; sessions: CoachSession[] }> {
  const supabase = await createClient();
  const { data: canView } = await supabase.rpc("can_view_student_health", { p_student_id: studentId });
  if (!canView) return { canReply: false, sessions: [] };
  const { data } = await supabase
    .from("workout_sessions")
    .select("id, started_at, workout_label, workout_name, rpe, feedback_note, coach_reply")
    .eq("student_id", studentId)
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(10);
  return {
    canReply: true,
    sessions: (data ?? []).map((s) => ({
      id: s.id,
      startedAt: s.started_at,
      workoutLabel: s.workout_label,
      workoutName: s.workout_name,
      rpe: s.rpe,
      feedbackNote: s.feedback_note,
      coachReply: s.coach_reply,
    })),
  };
}
