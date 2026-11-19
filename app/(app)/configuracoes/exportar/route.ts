import { NextResponse, type NextRequest } from "next/server";
import { exportToCsv, type ExportKind } from "@/features/settings/settings";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

/**
 * Exportação da conta (só o personal/owner): `?tipo=students|sessions`, CSV com defesa contra fórmula. Saúde só com
 * `saude=1` (opt-in explícito na tela, com aviso) — o banco também só devolve a saúde nesse caso. Funciona com a conta
 * encerrada (é leitura). Registra só o tipo, a contagem e o opt-in (`log_account_export`).
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "owner") return new NextResponse(null, { status: 403 });

  const kind: ExportKind = request.nextUrl.searchParams.get("tipo") === "sessions" ? "sessions" : "students";
  const includeHealth = request.nextUrl.searchParams.get("saude") === "1";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("export_account_data", { p_kind: kind, p_include_health: includeHealth });
  if (error) return new NextResponse(null, { status: 403 });
  const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  await supabase.rpc("log_account_export", { p_kind: kind, p_count: rows.length, p_include_health: includeHealth });

  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const filename = `${kind === "students" ? "alunos" : "historico-de-treinos"}-${stamp}.csv`;
  return new NextResponse(exportToCsv(kind, rows, includeHealth), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
