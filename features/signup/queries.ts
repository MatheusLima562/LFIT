import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { parseSignupConfig, type SignupConfig } from "./schemas";

/** Formulário público pelo token (lido com a secret key; anon não acessa o banco). */
export async function getPublicSignupForm(token: string): Promise<{ organizationName: string; config: SignupConfig } | null> {
  if (!/^[a-f0-9]{20,80}$/.test(token)) return null;
  const { data } = await createAdminClient().rpc("get_public_signup_form", { p_token: token });
  const form = data?.[0];
  return form ? { organizationName: form.organization_name, config: parseSignupConfig(form.form_config) } : null;
}

export interface SignupLinkAdmin {
  token: string;
  isActive: boolean;
  config: SignupConfig;
}

/** Link da organização (cria na primeira vez). Somente owner. */
export async function getSignupLinkAdmin(): Promise<SignupLinkAdmin | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("ensure_signup_link");
  if (!data) return null;
  return { token: data.token, isActive: data.is_active, config: parseSignupConfig(data.form_config) };
}

export interface PendingSignup {
  id: string;
  createdAt: string;
  consentAt: string | null;
  firstName: string;
  lastName: string;
  email: string;
  birthDate: string | null;
  whatsapp: string | null;
  sex: "M" | "F" | null;
  trainingLocation: string | null;
  healthDescription: string | null;
}

export async function listPendingSignups(): Promise<PendingSignup[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pending_signups")
    .select("id, created_at, consent_at, payload")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  return (data ?? []).map((row) => {
    const payload = (row.payload ?? {}) as Record<string, string | undefined>;
    return {
      id: row.id,
      createdAt: row.created_at,
      consentAt: row.consent_at,
      firstName: payload.first_name ?? "",
      lastName: payload.last_name ?? "",
      email: payload.email ?? "",
      birthDate: payload.birth_date ?? null,
      whatsapp: payload.whatsapp_e164 ?? null,
      sex: payload.sex === "M" || payload.sex === "F" ? payload.sex : null,
      trainingLocation: payload.training_location ?? null,
      healthDescription: payload.health_description ?? null,
    };
  });
}

/** Contagem para o botão em "Meus alunos" (RLS: só o owner enxerga pendentes). */
export async function countPendingSignups() {
  const supabase = await createClient();
  const { count } = await supabase.from("pending_signups").select("id", { count: "exact", head: true }).eq("status", "pending");
  return count ?? 0;
}
