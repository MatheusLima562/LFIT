"use server";

import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { siteUrl } from "@/lib/site";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { createAccountSchema, type CreateAccountInput } from "./platform";

const t = messages.platform;
type Result = { ok: true; url: string; orgId?: string } | { ok: false; error: string };

const inviteUrl = async (tokenHash: string, type: "invite" | "recovery") =>
  `${await siteUrl()}/auth/confirm?token_hash=${tokenHash}&type=${type}&next=/convite`;

/**
 * Cria a conta de um personal. Ordem (secret key só depois da autorização com a sessão do admin):
 * 1) `platform_access = 'ok'` com a sessão (lista + MFA); 2) a secret key cria o usuário do Auth por convite (sem senha, sem e-mail
 * enviado) e devolve o token; 3) `platform_create_account` (sessão do admin) cria organização + owner e audita.
 * Falhou o passo 3 → o usuário criado no passo 2 é apagado. O link volta só nesta resposta.
 */
export async function createPersonalAccount(input: CreateAccountInput): Promise<Result> {
  const parsed = createAccountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  const v = parsed.data;

  const supabase = await createClient();
  // Lista + MFA (aal2) conferidos pelo banco ANTES de a secret key entrar em cena.
  if ((await supabase.rpc("platform_access")).data !== "ok") return { ok: false, error: messages.dbErrors.FORBIDDEN };

  const admin = createAdminClient();
  const link = await admin.auth.admin.generateLink({ type: "invite", email: v.email });
  if (link.error || !link.data.user) {
    const inUse = /already|registered|exists/i.test(link.error?.message ?? "");
    return { ok: false, error: inUse ? t.create.emailInUse : messages.auth.errors.generic };
  }
  const userId = link.data.user.id;

  const { data: orgId, error } = await supabase.rpc("platform_create_account", {
    p_user_id: userId, p_org_name: v.business, p_owner_name: v.owner, p_plan: v.plan, p_student_limit: v.limit,
  });
  if (error || !orgId) {
    await admin.auth.admin.deleteUser(userId);
    return { ok: false, error: dbErrorMessage(error) };
  }
  return { ok: true, orgId: orgId as string, url: await inviteUrl(link.data.properties.hashed_token, "invite") };
}

/** Novo link de acesso para o personal (ex.: o primeiro expirou). Autoriza e audita com a sessão antes da secret key. */
export async function regenerateOwnerLink(orgId: string): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_account_owner", { p_org: orgId });
  const owner = (data as { user_id: string; email: string }[] | null)?.[0];
  if (error || !owner) return { ok: false, error: dbErrorMessage(error) };

  // O usuário já existe: link de recuperação leva a "definir senha" (/convite) com sessão, sem e-mail enviado.
  const link = await createAdminClient().auth.admin.generateLink({ type: "recovery", email: owner.email });
  if (link.error) return { ok: false, error: messages.auth.errors.generic };
  await supabase.rpc("platform_log_invite", { p_org: orgId });
  return { ok: true, url: await inviteUrl(link.data.properties.hashed_token, "recovery") };
}
