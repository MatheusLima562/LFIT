import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Cliente com service_role: IGNORA o RLS. Use apenas no servidor e só para
 * o que o usuário não pode fazer com a própria sessão (Auth admin, rate limit,
 * cadastro público, consumo de links de acesso).
 */
export function createAdminClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
