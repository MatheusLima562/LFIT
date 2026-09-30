"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/server";
import { clientIp, withinRateLimit } from "@/lib/security/rate-limit";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { signInSchema, type ActionResult } from "@/features/auth/schemas";

const t = messages.auth;

/** Login do app do aluno: mesmo rate limit do painel; só papel `student`. */
export async function signInStudent(input: unknown): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t.errors.invalidCredentials };
  const { email, password } = parsed.data;

  const ip = await clientIp();
  const allowed = await withinRateLimit([
    { key: `login:ip:${ip}`, max: 20, windowSeconds: 15 * 60 },
    { key: `login:email:${email}`, max: 8, windowSeconds: 15 * 60 },
  ]);
  if (!allowed) return { ok: false, error: t.errors.rateLimited };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { ok: false, error: t.errors.invalidCredentials };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (!profile || profile.role !== "student") {
    await supabase.auth.signOut();
    return { ok: false, error: messages.aluno.signIn.wrongApp };
  }
  redirect("/aluno");
}

export async function signOutStudent(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/aluno/entrar");
}

export type StartSessionResult = { ok: true; sessionId: string; askPainCheckin: boolean } | { ok: false; error: string };

/** Inicia (ou retoma) a sessão da divisão escolhida. `studentId` = modo presencial (staff). */
export async function startSession(planId: string, workoutId: string, studentId?: string): Promise<StartSessionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_workout_session", {
    p_plan_id: planId,
    p_workout_id: workoutId,
    ...(studentId ? { p_student_id: studentId } : {}),
  });
  const row = data?.[0];
  if (error || !row) return { ok: false, error: dbErrorMessage(error) };
  return { ok: true, sessionId: row.session_id, askPainCheckin: row.ask_pain_checkin };
}
