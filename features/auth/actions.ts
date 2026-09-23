"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { clientIp, withinRateLimit } from "@/lib/security/rate-limit";
import { messages } from "@/messages/pt-BR";
import { slugify } from "@/lib/text";
import {
  forgotPasswordSchema,
  newPasswordSchema,
  safeNext,
  signInSchema,
  signUpSchema,
  type ActionResult,
} from "./schemas";

const t = messages.auth;

async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

export async function signIn(input: unknown, next?: string): Promise<ActionResult> {
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
  if (!profile || profile.role === "student") {
    await supabase.auth.signOut();
    return { ok: false, error: t.errors.noProfile };
  }

  redirect(safeNext(next));
}

export async function requestPasswordReset(input: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: messages.validation.email };
  const { email } = parsed.data;

  const ip = await clientIp();
  const allowed = await withinRateLimit([
    { key: `reset:ip:${ip}`, max: 10, windowSeconds: 60 * 60 },
    { key: `reset:email:${email}`, max: 3, windowSeconds: 60 * 60 },
  ]);
  if (!allowed) return { ok: false, error: t.errors.rateLimited };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteUrl()}/auth/confirm?next=/redefinir-senha`,
  });

  // Resposta idêntica exista ou não a conta (não revela e-mails cadastrados).
  return { ok: true, message: t.forgot.sent };
}

export async function setNewPassword(input: unknown): Promise<ActionResult> {
  const parsed = newPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? t.errors.generic };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return { ok: false, error: t.newPassword.expired };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: t.errors.generic };

  // Alunos ainda não têm app (Fase 3): encerra a sessão e mostra a confirmação.
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.claims.sub).maybeSingle();
  if (profile?.role === "student") {
    await supabase.auth.signOut();
    redirect("/acesso/pronto");
  }

  redirect("/");
}

export async function signUp(input: unknown): Promise<ActionResult> {
  if (process.env.ALLOW_PUBLIC_SIGNUP !== "true") return { ok: false, error: t.errors.generic };

  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? t.errors.generic };
  const { organization, fullName, email, password } = parsed.data;

  const ip = await clientIp();
  if (!(await withinRateLimit([{ key: `signup:ip:${ip}`, max: 5, windowSeconds: 60 * 60 }]))) {
    return { ok: false, error: t.errors.rateLimited };
  }

  const admin = createAdminClient();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) return { ok: false, error: t.errors.generic };

  const slug = `${slugify(organization) || "conta"}-${crypto.randomUUID().slice(0, 6)}`;

  const org = await admin.from("organizations").insert({ name: organization, slug }).select("id").single();
  const profile = org.data
    ? await admin.from("profiles").insert({ id: created.data.user.id, organization_id: org.data.id, role: "owner", full_name: fullName })
    : null;

  if (!org.data || profile?.error) {
    await admin.auth.admin.deleteUser(created.data.user.id);
    if (org.data) await admin.from("organizations").delete().eq("id", org.data.id);
    return { ok: false, error: t.errors.generic };
  }

  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email, password });
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/entrar");
}
