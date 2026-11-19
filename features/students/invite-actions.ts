"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/server";
import { siteUrl } from "@/lib/site";
import { dbErrorMessage, messages } from "@/messages/pt-BR";

const idsSchema = z.array(z.uuid()).min(1).max(200);

export type InviteResult =
  | { ok: true; items: { studentId: string; url: string; expiresAt: string }[] }
  | { ok: false; error: string };

/**
 * Gera convites (link de uso único, 7 dias) para os alunos escolhidos. Regras, limite diário e auditoria na RPC; o token
 * existe só nesta resposta (o banco guarda o hash). Nada é enviado por e-mail.
 */
export async function createInvites(studentIds: string[]): Promise<InviteResult> {
  if (!idsSchema.safeParse(studentIds).success) return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_student_invites", { p_student_ids: studentIds });
  if (error) {
    if (error.message === "INVITE_LIMIT_REACHED") return { ok: false, error: messages.invites.limit(Number(error.details) || 0) };
    return { ok: false, error: dbErrorMessage(error) };
  }
  const site = await siteUrl();
  revalidatePath("/alunos");
  return {
    ok: true,
    items: (data ?? []).map((r: { student_id: string; token: string; expires_at: string }) => ({
      studentId: r.student_id,
      url: `${site}/acesso/${r.token}`,
      expiresAt: r.expires_at,
    })),
  };
}
