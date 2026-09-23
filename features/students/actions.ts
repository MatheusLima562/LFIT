"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { AccountConflictError, linkStudentAccount, type StudentAccountTarget } from "./account";

const t = messages.students;

export type StudentActionResult = { ok: true; message: string; url?: string } | { ok: false; error: string };

const statusActions = {
  deactivate: { rpc: "deactivate_student", done: t.actions.deactivated },
  reactivate: { rpc: "reactivate_student", done: t.actions.reactivated },
  expire: { rpc: "expire_student", done: t.actions.expired },
  clearExpiration: { rpc: "clear_student_expiration", done: t.actions.expirationCleared },
} as const;

export type StudentStatusAction = keyof typeof statusActions;

const idSchema = z.uuid();

async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

/** Desativar / reativar / expirar / limpar expiração — regras e auditoria nas RPCs. */
export async function changeStudentStatus(action: StudentStatusAction, studentId: string): Promise<StudentActionResult> {
  const config = statusActions[action];
  if (!config || !idSchema.safeParse(studentId).success) return { ok: false, error: messages.auth.errors.generic };

  const supabase = await createClient();
  const { error } = await supabase.rpc(config.rpc, { p_student_id: studentId });
  if (error) return { ok: false, error: dbErrorMessage(error) };

  revalidatePath("/alunos");
  return { ok: true, message: config.done };
}

/** Exclusão (soft delete) — exige o nome completo do aluno como confirmação. */
export async function deleteStudent(studentId: string, confirmName: string): Promise<StudentActionResult> {
  if (!idSchema.safeParse(studentId).success) return { ok: false, error: messages.auth.errors.generic };

  const supabase = await createClient();
  const { error } = await supabase.rpc("soft_delete_student", { p_student_id: studentId, p_confirm_name: confirmName });
  if (error) return { ok: false, error: dbErrorMessage(error) };

  revalidatePath("/alunos");
  return { ok: true, message: t.actions.deleted };
}

/** Link de "definir senha" de uso único (30 min). O token só existe nesta resposta. */
export async function createAccessLink(studentId: string): Promise<StudentActionResult> {
  if (!idSchema.safeParse(studentId).success) return { ok: false, error: messages.auth.errors.generic };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_access_link", { p_student_id: studentId });
  if (error || !data) return { ok: false, error: dbErrorMessage(error) };

  return { ok: true, message: t.actions.linkCopied, url: `${await siteUrl()}/acesso/${data}` };
}

/** (Re)envia o e-mail de acesso: convite se ainda não há conta, recuperação se já existe. */
export async function resendInvite(studentId: string): Promise<StudentActionResult> {
  if (!idSchema.safeParse(studentId).success) return { ok: false, error: messages.auth.errors.generic };

  // 1) Autorização e auditoria com a sessão do usuário (RLS decide).
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_student_access_email", { p_student_id: studentId }).single();
  if (error || !data) return { ok: false, error: dbErrorMessage(error) };
  const target = data as StudentAccountTarget;

  // 2) Só então o Auth admin.
  const admin = createAdminClient();
  const site = await siteUrl();
  try {
    if (target.user_id) {
      const sent = await admin.auth.resetPasswordForEmail(target.email, {
        redirectTo: `${site}/auth/confirm?next=/redefinir-senha`,
      });
      if (sent.error) return { ok: false, error: t.actions.emailFailed };
    } else {
      const invited = await admin.auth.admin.inviteUserByEmail(target.email, {
        redirectTo: `${site}/auth/confirm?next=/convite`,
      });
      if (invited.error) {
        return { ok: false, error: invited.error.status === 422 ? t.actions.emailInUse : t.actions.emailFailed };
      }
      await linkStudentAccount(admin, target, invited.data.user.id);
    }
  } catch (e) {
    return { ok: false, error: e instanceof AccountConflictError ? t.actions.emailInUse : t.actions.emailFailed };
  }

  revalidatePath("/alunos");
  return { ok: true, message: t.actions.inviteSent };
}

const viewSchema = z.enum(["list", "cards"]);

/** Preferência lista ↔ cards, salva no perfil do usuário. */
export async function setStudentsView(view: string): Promise<void> {
  const parsed = viewSchema.safeParse(view);
  if (!parsed.success) return;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return;

  const { data: profile } = await supabase.from("profiles").select("preferences").eq("id", userId).single();
  const current = (profile?.preferences as Record<string, unknown> | null) ?? {};
  await supabase.from("profiles").update({ preferences: { ...current, studentsView: parsed.data } }).eq("id", userId);
  revalidatePath("/alunos");
}
