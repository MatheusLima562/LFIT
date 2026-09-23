import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

type Admin = SupabaseClient<Database>;

export interface StudentAccountTarget {
  student_id: string;
  organization_id: string;
  user_id: string | null;
  email: string;
  first_name: string;
}

export class AccountConflictError extends Error {
  constructor() {
    super("EMAIL_IN_USE");
  }
}

/**
 * Vincula um usuário recém-criado no Auth ao aluno (perfil `student` + students.user_id).
 * Em conflito (e-mail já usado por outra conta do LFit), desfaz e lança AccountConflictError.
 */
export async function linkStudentAccount(admin: Admin, target: StudentAccountTarget, userId: string) {
  const profile = await admin.from("profiles").insert({
    id: userId,
    organization_id: target.organization_id,
    role: "student",
    full_name: target.first_name,
  });
  const link = profile.error
    ? profile
    : await admin.from("students").update({ user_id: userId }).eq("id", target.student_id).is("user_id", null);

  if (profile.error || link.error) {
    if (!profile.error) await admin.from("profiles").delete().eq("id", userId);
    throw new AccountConflictError();
  }
}

/**
 * Gera o token de "definir senha" do Supabase para o aluno, criando a conta se ainda não existir.
 * Nunca gera magic link de login direto: é sempre convite (conta nova) ou recuperação (conta existente).
 */
export async function generateSetPasswordToken(admin: Admin, target: StudentAccountTarget) {
  if (target.user_id) {
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: target.email });
    if (error) throw error;
    return { tokenHash: data.properties.hashed_token, type: "recovery" as const };
  }

  const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email: target.email });
  if (error) throw new AccountConflictError();
  await linkStudentAccount(admin, target, data.user.id);
  return { tokenHash: data.properties.hashed_token, type: "invite" as const };
}
