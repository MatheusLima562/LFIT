"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { sha256Hex } from "@/lib/security/hash";
import { clientIp, withinRateLimit } from "@/lib/security/rate-limit";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import {
  parseSignupConfig,
  publicSignupSchema,
  signupConfigSchema,
  toSignupPayload,
  type PublicSignupInput,
  type SignupConfig,
} from "./schemas";
import { verifyTurnstile } from "./turnstile";

const p = messages.signup.public;
const a = messages.signup.admin;
const tokenSchema = z.string().min(20).max(80).regex(/^[a-f0-9]+$/);

export type PublicSignupResult = { ok: true } | { ok: false; error: string; field?: keyof PublicSignupInput; captcha?: boolean };

/**
 * Envio do formulário público. Ordem: validação → honeypot → rate limit → Turnstile → RPC.
 * A RPC roda com a secret key porque o anônimo não tem acesso ao banco.
 */
export async function submitPublicSignup(
  token: string,
  input: PublicSignupInput,
  captchaToken: string | null,
): Promise<PublicSignupResult> {
  if (!tokenSchema.safeParse(token).success) return { ok: false, error: p.unavailableText };

  const admin = createAdminClient();
  const { data: forms } = await admin.rpc("get_public_signup_form", { p_token: token });
  const form = forms?.[0];
  if (!form) return { ok: false, error: p.unavailableText };
  const config = parseSignupConfig(form.form_config);

  const parsed = publicSignupSchema(config).safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? messages.dbErrors.INVALID_INPUT, field: issue?.path[0] as keyof PublicSignupInput };
  }

  // Honeypot: bots preenchem campos ocultos. Responde como sucesso e descarta.
  if (parsed.data.website) return { ok: true };

  const ip = await clientIp();
  const allowed = await withinRateLimit([
    { key: `signup:ip:${ip}`, max: 5, windowSeconds: 60 * 60 },
    { key: `signup:link:${sha256Hex(token).slice(0, 16)}`, max: 100, windowSeconds: 60 * 60 },
  ]);
  if (!allowed) return { ok: false, error: messages.auth.errors.rateLimited };

  if (!(await verifyTurnstile(captchaToken, ip))) return { ok: false, error: p.captchaFailed, captcha: true };

  const { error } = await admin.rpc("submit_public_signup", {
    p_token: token,
    p_payload: toSignupPayload(parsed.data, config),
    p_consent: parsed.data.consent,
  });
  if (error) return { ok: false, error: dbErrorMessage(error) };
  return { ok: true };
}

// --- Owner -----------------------------------------------------------------

type AdminResult = { ok: true; message: string; token?: string } | { ok: false; error: string };
const PATH = "/alunos/cadastros-publicos";

export async function setSignupLinkActive(active: boolean): Promise<AdminResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("public_signup_links")
    .update({ is_active: active === true })
    .not("id", "is", null)
    .select("id");
  if (error || !data?.length) return { ok: false, error: dbErrorMessage(error) };
  revalidatePath(PATH);
  return { ok: true, message: active ? a.active : a.activeHint };
}

export async function updateSignupFields(config: SignupConfig): Promise<AdminResult> {
  const parsed = signupConfigSchema.safeParse(config);
  if (!parsed.success) return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("public_signup_links")
    .update({ form_config: { fields: parsed.data } })
    .not("id", "is", null)
    .select("id");
  if (error || !data?.length) return { ok: false, error: dbErrorMessage(error) };
  revalidatePath(PATH);
  return { ok: true, message: a.fieldsSaved };
}

export async function regenerateSignupToken(): Promise<AdminResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("regenerate_signup_token");
  if (error || !data) return { ok: false, error: dbErrorMessage(error) };
  revalidatePath(PATH);
  return { ok: true, message: a.regenerated, token: data.token };
}

const idsSchema = z.array(z.uuid()).min(1).max(100);
const optionalUuid = z.uuid().nullable();

export type ApproveResult = { ok: true; message: string } | { ok: false; error: string; planLimit?: boolean };

export async function approveSignup(id: string, trainerId: string | null, groupIds: string[]): Promise<ApproveResult> {
  if (!idsSchema.safeParse([id]).success || !optionalUuid.safeParse(trainerId).success || !z.array(z.uuid()).safeParse(groupIds).success) {
    return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_signup", { p_id: id, p_trainer_id: trainerId ?? undefined, p_group_ids: groupIds });
  if (error) return { ok: false, error: dbErrorMessage(error), planLimit: error.message === "PLAN_LIMIT_REACHED" };
  revalidatePath(PATH);
  revalidatePath("/alunos");
  return { ok: true, message: a.approved(1) };
}

export async function approveSignups(ids: string[], trainerId: string | null): Promise<ApproveResult> {
  if (!idsSchema.safeParse(ids).success || !optionalUuid.safeParse(trainerId).success) {
    return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_signups", { p_ids: ids, p_trainer_id: trainerId ?? undefined });
  if (error) return { ok: false, error: dbErrorMessage(error), planLimit: error.message === "PLAN_LIMIT_REACHED" };
  revalidatePath(PATH);
  revalidatePath("/alunos");
  return { ok: true, message: a.approved(ids.length) };
}

export async function rejectSignups(ids: string[]): Promise<ApproveResult> {
  if (!idsSchema.safeParse(ids).success) return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reject_signups", { p_ids: ids });
  if (error) return { ok: false, error: dbErrorMessage(error) };
  revalidatePath(PATH);
  return { ok: true, message: a.rejected(Number(data ?? ids.length)) };
}
