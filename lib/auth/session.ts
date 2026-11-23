import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/db/server";
import type { Database } from "@/lib/db/types";

export type UserRole = Database["public"]["Enums"]["user_role"];

export interface Session {
  userId: string;
  fullName: string;
  firstName: string;
  role: UserRole;
  organizationId: string;
  organizationName: string;
}

/** Sessão atual (JWT verificado) + perfil. Memorizada por requisição. */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, organization_id, organizations(name)")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return null;

  return {
    userId,
    fullName: profile.full_name,
    firstName: profile.full_name.split(" ")[0],
    role: profile.role,
    organizationId: profile.organization_id,
    organizationName: profile.organizations?.name ?? "",
  };
});

/** Exige owner/trainer. Sem sessão → login; sem perfil → sai com aviso; aluno → app do aluno. */
export async function requireStaff(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims?.sub) redirect("/entrar");
    // Admin da plataforma sem perfil de organização: vai para o painel da plataforma (não é "perfil ausente").
    if ((await supabase.rpc("is_platform_admin")).data === true) redirect("/plataforma");
    redirect("/auth/sair?motivo=perfil");
  }
  if (session.role === "student") redirect("/aluno");
  return session;
}

/**
 * Exige admin da PLATAFORMA (lista `private.platform_admins`, nunca papel da organização) com MFA. Sem sessão → login;
 * logado fora da lista → 404 (a área nem aparece); na lista sem aal2 (TOTP) → tela do autenticador. O banco recusa
 * as RPCs da plataforma sem aal2 de qualquer jeito. Devolve só o id e o e-mail.
 */
export async function requirePlatformAdmin(): Promise<{ userId: string; email: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/entrar?next=/plataforma");
  const { data: access } = await supabase.rpc("platform_access");
  if (access === "mfa_required") redirect("/plataforma-verificacao");
  if (access !== "ok") notFound();
  return { userId, email: typeof data?.claims?.email === "string" ? data.claims.email : "" };
}

/** Exige aluno (app do aluno). Sem sessão → login do app; staff → painel. */
export async function requireStudent(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/aluno/entrar");
  if (session.role !== "student") redirect("/");
  return session;
}
