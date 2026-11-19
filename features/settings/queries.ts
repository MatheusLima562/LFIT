import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { BRANDING_BUCKET } from "./settings";

const TTL = 60 * 60;

export interface Branding {
  name: string;
  logoPath: string | null;
  logoUrl: string | null;
  contactWhatsapp: string | null;
}

/** Assina com a sessão do usuário (o RLS do Storage decide: equipe ou aluno da própria organização). */
async function signOwn(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from(BRANDING_BUCKET).createSignedUrl(path, TTL);
  return data?.signedUrl ?? null;
}

/** Nome, logo e WhatsApp do negócio de quem está logado (equipe ou aluno). */
export const getMyBranding = cache(async (): Promise<Branding | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_branding");
  if (error || !data) return null;
  const r = data as { name?: string; logo_path?: string | null; contact_whatsapp?: string | null };
  const logoPath = r.logo_path ?? null;
  return { name: r.name ?? "", logoPath, logoUrl: await signOwn(logoPath), contactWhatsapp: r.contact_whatsapp ?? null };
});

/** Perfil do próprio usuário da equipe (nome e foto). */
export async function getMyStaffProfile(userId: string): Promise<{ fullName: string; avatarPath: string | null; avatarUrl: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("full_name, avatar_path").eq("id", userId).single();
  const avatarPath = data?.avatar_path ?? null;
  return { fullName: data?.full_name ?? "", avatarPath, avatarUrl: await signOwn(avatarPath) };
}

/**
 * Nome e logo do negócio na tela do link de acesso/convite (ainda sem sessão). A RPC só responde se o token vale (sem
 * consumir); só então o logo é assinado com a secret key.
 */
export async function getAccessLinkBranding(token: string): Promise<{ name: string; logoUrl: string | null } | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const admin = createAdminClient();
  const { data } = await admin.rpc("get_access_link_branding", { p_token: token });
  if (!data) return null;
  const r = data as { name?: string; logo_path?: string | null };
  let logoUrl: string | null = null;
  if (r.logo_path) {
    const signed = await admin.storage.from(BRANDING_BUCKET).createSignedUrl(r.logo_path, TTL);
    logoUrl = signed.data?.signedUrl ?? null;
  }
  return { name: r.name ?? "", logoUrl };
}
