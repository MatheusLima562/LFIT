"use server";

import { createClient } from "@/lib/db/server";
import { messages } from "@/messages/pt-BR";

/** O próprio aluno (titular) confirma ou recusa o consentimento para dados de saúde. */
export async function respondHealthConsent(accept: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_my_health_consent", { p_accept: accept === true });
  if (error) return { ok: false, error: messages.auth.errors.generic };
  return { ok: true };
}
