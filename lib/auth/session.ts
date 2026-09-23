import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
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

/** Exige owner/trainer. Sem sessão → login; aluno ou sem perfil → sai com aviso. */
export async function requireStaff(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    redirect(data?.claims?.sub ? "/auth/sair?motivo=perfil" : "/entrar");
  }
  if (session.role === "student") redirect("/auth/sair?motivo=perfil");
  return session;
}
