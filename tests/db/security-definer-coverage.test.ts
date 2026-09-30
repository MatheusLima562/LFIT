import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dbTestsEnabled } from "./helpers";

/**
 * Cobertura da tabela "Funções SECURITY DEFINER" do CLAUDE.md: toda função SECURITY DEFINER do schema
 * `public` (a que o Security Advisor avisa "authenticated can execute") precisa estar documentada lá —
 * nome + quem pode + checagem interna — e o CLAUDE.md não pode citar uma função que não existe mais.
 *
 * Não muda nada no banco: lê o catálogo (pg_proc/pg_namespace) via `supabase db query --linked`, que
 * consulta pelo Management API (sem senha de banco nem função nova). Só roda com ALLOW_DB_TESTS=true e a
 * CLI logada (`npx supabase login`), como o resto de tests/db.
 */

/** Nomes citados na coluna "Funções" da tabela do CLAUDE.md (única fonte — nada de lista duplicada aqui). */
function documentedFunctionNames(): string[] {
  const md = readFileSync(join(process.cwd(), "CLAUDE.md"), "utf8");
  const start = md.indexOf("## Funções SECURITY DEFINER");
  if (start === -1) throw new Error("Seção 'Funções SECURITY DEFINER' não encontrada no CLAUDE.md");
  const rest = md.slice(start);
  const nextHeading = rest.indexOf("\n## ", 3);
  const section = rest.slice(0, nextHeading === -1 ? undefined : nextHeading);
  const rows = section.split("\n").filter((l) => l.trim().startsWith("|") && !l.includes("---"));
  const names = new Set<string>();
  for (const row of rows) {
    const cols = row.split("|");
    const funcsCol = cols[2] ?? ""; // | Quem pode | Funções | Checagem interna |
    for (const m of funcsCol.matchAll(/`([a-z][a-z0-9_]*)`/g)) names.add(m[1]);
  }
  return [...names];
}

/** Funções SECURITY DEFINER hoje no schema `public` (as expostas via PostgREST, alvo do aviso do advisor). */
function livePublicSecurityDefinerFunctions(): string[] {
  const sql =
    "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
    "where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef = true order by p.proname;";
  const out = execFileSync("npx", ["supabase", "db", "query", "--linked", sql], {
    encoding: "utf8",
    cwd: process.cwd(),
  });
  const parsed = JSON.parse(out) as { rows: { proname: string }[] };
  return parsed.rows.map((r) => r.proname);
}

describe.runIf(dbTestsEnabled)("Cobertura do CLAUDE.md: funções SECURITY DEFINER do schema public", () => {
  it("toda função SECURITY DEFINER de public está documentada, e o CLAUDE.md não cita função inexistente", () => {
    const live = livePublicSecurityDefinerFunctions();
    const documented = documentedFunctionNames();

    const undocumented = live.filter((name) => !documented.includes(name));
    const stale = documented.filter((name) => !live.includes(name));

    expect(undocumented, `Funções SECURITY DEFINER sem documentação no CLAUDE.md: ${undocumented.join(", ") || "—"}`).toEqual([]);
    expect(stale, `CLAUDE.md cita função(ões) que não existe(m) mais (ou não é mais SECURITY DEFINER): ${stale.join(", ") || "—"}`).toEqual([]);
  });
});
