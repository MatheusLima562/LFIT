"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { getSession } from "@/lib/auth/session";
import type { Json } from "@/lib/db/types";
import { AccountConflictError, linkStudentAccount, type StudentAccountTarget } from "./account";
import { studentFormSchema, toStudentPayload } from "./schemas";

const t = messages.students;
const f = messages.studentForm;

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

/**
 * Envia o e-mail de acesso: convite se ainda não há conta, recuperação se já existe.
 * A RPC (sessão do usuário) autoriza e audita ANTES de usar a secret key.
 */
async function sendAccessEmail(studentId: string): Promise<StudentActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_student_access_email", { p_student_id: studentId }).single();
  if (error || !data) return { ok: false, error: dbErrorMessage(error) };
  const target = data as StudentAccountTarget;

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
  return { ok: true, message: t.actions.inviteSent };
}

/** (Re)envia o e-mail de acesso a partir do menu da lista. */
export async function resendInvite(studentId: string): Promise<StudentActionResult> {
  if (!idSchema.safeParse(studentId).success) return { ok: false, error: messages.auth.errors.generic };
  const result = await sendAccessEmail(studentId);
  if (result.ok) revalidatePath("/alunos");
  return result;
}

export type SaveStudentResult =
  | { ok: true; studentId: string; message: string; warnings: string[] }
  | { ok: false; error: string; field?: "email"; planLimit?: boolean; limit?: number };

/** Cadastro/edição. Mesmo schema do formulário; regras (limite, matrícula, auditoria) nas RPCs. */
export async function saveStudent(input: unknown, studentId?: string): Promise<SaveStudentResult> {
  const parsed = studentFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? messages.dbErrors.INVALID_INPUT };
  if (studentId && !idSchema.safeParse(studentId).success) return { ok: false, error: messages.auth.errors.generic };

  const session = await getSession();
  if (!session || session.role === "student") return { ok: false, error: messages.dbErrors.FORBIDDEN };
  const values = parsed.data;
  // Só o owner escolhe/reatribui professor; para trainers o banco fixa o próprio usuário.
  const supabase = await createClient();
  const includeGroups = studentId
    ? (await supabase.rpc("can_view_student_health", { p_student_id: studentId })).data === true
    : true;
  const payload = toStudentPayload(values, { includeTrainer: session.role === "owner", includeGroups });

  const { data, error } = studentId
    ? await supabase.rpc("update_student", { p_student_id: studentId, p_patch: payload as Json })
    : await supabase.rpc("create_student", { p_data: payload as Json });

  if (error || !data) {
    if (error?.code === "23505") return { ok: false, error: f.errors.emailTaken, field: "email" };
    if (error?.message === "PLAN_LIMIT_REACHED") {
      // O banco informa "usados/limite" no detail (ex.: "50/50").
      const limit = Number(error.details?.split("/")[1]) || undefined;
      return { ok: false, error: dbErrorMessage(error), planLimit: true, limit };
    }
    return { ok: false, error: dbErrorMessage(error) };
  }

  const id = (data as { id: string }).id;
  const warnings: string[] = [];

  if (values.sendInvite) {
    const invite = await sendAccessEmail(id);
    if (!invite.ok) warnings.push(f.warnings.invite);
  }
  if (values.sendAnamnesis && values.anamnesisTemplateId) {
    const { error: anamnesisError } = await supabase.rpc("request_anamnesis", {
      p_student_id: id,
      p_template_id: values.anamnesisTemplateId,
    });
    if (anamnesisError) warnings.push(f.warnings.anamnesis);
  }

  revalidatePath("/alunos");
  return { ok: true, studentId: id, message: studentId ? f.saved : f.created, warnings };
}

const photoPathSchema = z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/);

/**
 * Grava (ou remove, com null) o caminho da foto já enviada ao Storage pelo cliente.
 * A foto anterior é apagada. O banco garante que o caminho é da pasta do próprio aluno.
 */
export async function setStudentPhoto(studentId: string, path: string | null): Promise<StudentActionResult> {
  if (!idSchema.safeParse(studentId).success || (path !== null && !photoPathSchema.safeParse(path).success)) {
    return { ok: false, error: messages.auth.errors.generic };
  }
  const supabase = await createClient();
  const { data: current } = await supabase.from("students").select("photo_path").eq("id", studentId).maybeSingle();

  const { error } = await supabase.rpc("update_student", { p_student_id: studentId, p_patch: { photo_path: path } });
  if (error) return { ok: false, error: dbErrorMessage(error) };

  if (current?.photo_path && current.photo_path !== path) {
    await supabase.storage.from("student-photos").remove([current.photo_path]);
  }
  revalidatePath("/alunos");
  return { ok: true, message: f.saved };
}

const groupSchema = z.object({ name: z.string().trim().min(2).max(60) });
const GROUP_COLORS = ["#f0642d", "#7c5cfc", "#1ba39c", "#e0a100", "#d6336c", "#2f80ed"];

/** Cria grupo especial inline (RLS: staff da organização). */
export async function createSpecialGroup(
  name: string,
): Promise<{ ok: true; group: { id: string; name: string; color: string } } | { ok: false; error: string }> {
  const parsed = groupSchema.safeParse({ name });
  const session = await getSession();
  if (!parsed.success || !session) return { ok: false, error: messages.dbErrors.INVALID_INPUT };

  const supabase = await createClient();
  const { count } = await supabase.from("special_groups").select("id", { count: "exact", head: true });
  const color = GROUP_COLORS[(count ?? 0) % GROUP_COLORS.length];
  const { data, error } = await supabase
    .from("special_groups")
    .insert({ organization_id: session.organizationId, name: parsed.data.name, color })
    .select("id, name, color")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.code === "23505" ? f.errors.groupExists : messages.auth.errors.generic };
  }
  return { ok: true, group: data };
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
