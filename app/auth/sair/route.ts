import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/db/server";

/** Encerra a sessão quando a conta não tem acesso ao painel (ex.: perfil de aluno). */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const reason = request.nextUrl.searchParams.get("motivo") === "perfil" ? "?erro=perfil" : "";
  return NextResponse.redirect(new URL(`/entrar${reason}`, request.nextUrl.origin));
}
