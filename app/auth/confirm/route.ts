import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/db/server";
import { safeNext } from "@/features/auth/schemas";

/**
 * Destino dos links de e-mail (convite, recuperação de senha).
 * Aceita o formato recomendado (token_hash + type) e o padrão PKCE (code).
 * Convites vão para /convite, recuperação para /redefinir-senha.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const fallback = type === "invite" ? "/convite" : "/redefinir-senha";
  const next = safeNext(searchParams.get("next"), fallback);

  const supabase = await createClient();
  let ok = false;

  if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  return NextResponse.redirect(new URL(ok ? next : "/entrar?erro=link", origin));
}
