import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

/** Cliente Supabase para Client Components (sessão via cookies, RLS aplicado). */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
