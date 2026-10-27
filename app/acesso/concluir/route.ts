import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/db/server";

/** Fim do primeiro acesso do aluno: encerra a sessão (app do aluno chega na Fase 3). */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const result = request.nextUrl.searchParams.get("consentimento");
  const query = result === "aceito" || result === "recusado" ? `?consentimento=${result}` : "";
  return NextResponse.redirect(new URL(`/acesso/pronto${query}`, request.nextUrl.origin));
}
