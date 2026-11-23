import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dbTestsEnabled } from "./helpers";
import { CLI_TIMEOUT_MS, sqlLinked } from "./linked-sql";

/**
 * Estrutural (1.2): toda tabela do schema `public` com `organization_id` tem o gatilho `org_writable`
 * (`private.enforce_org_writable`, somente leitura da conta suspensa/cancelada) OU está na lista de exceções
 * documentada no CLAUDE.md. Tabela nova sem gatilho e fora da lista → este teste falha.
 * Só lê o catálogo (information_schema/pg_trigger), pela CLI com a trava do lfit-dev.
 */
function documentedExceptions(): string[] {
  const md = readFileSync(join(process.cwd(), "CLAUDE.md"), "utf8");
  const line = md.split("\n").find((l) => l.includes("Exceções do gatilho org_writable:"));
  if (!line) throw new Error("Linha 'Exceções do gatilho org_writable:' não encontrada no CLAUDE.md");
  return [...line.matchAll(/`([a-z][a-z0-9_]*)`/g)].map((m) => m[1]!);
}

describe.runIf(dbTestsEnabled)("gatilho org_writable cobre toda tabela com organization_id", () => {
  it("tabela com organization_id sem o gatilho só se estiver na lista documentada; exceção existe e não tem gatilho", () => {
    const exceptions = documentedExceptions();
    expect(exceptions.length).toBeGreaterThan(0);
    const rows = sqlLinked(`
      select c.table_name as name,
             exists (
               select 1 from pg_trigger tg
               join pg_class cl on cl.oid = tg.tgrelid
               join pg_namespace n on n.oid = cl.relnamespace
               join pg_proc p on p.oid = tg.tgfoid
               join pg_namespace pn on pn.oid = p.pronamespace
               where n.nspname = 'public' and cl.relname = c.table_name and not tg.tgisinternal
                 and tg.tgname = 'org_writable' and pn.nspname = 'private' and p.proname = 'enforce_org_writable'
             ) as guarded
      from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'public' and c.column_name = 'organization_id' and t.table_type = 'BASE TABLE'
      order by 1;`) as { name: string; guarded: boolean }[];
    expect(rows.length).toBeGreaterThan(10);

    const unguarded = rows.filter((r) => !r.guarded && !exceptions.includes(r.name)).map((r) => r.name);
    expect(unguarded, "tabela com organization_id sem o gatilho org_writable e fora da lista do CLAUDE.md").toEqual([]);

    // A lista não pode citar tabela que não existe mais (lista velha esconde erro).
    const names = rows.map((r) => r.name);
    expect(exceptions.filter((e) => !names.includes(e)), "exceção documentada que não existe").toEqual([]);
    // Exceção com gatilho = lista desatualizada.
    expect(rows.filter((r) => r.guarded && exceptions.includes(r.name)).map((r) => r.name)).toEqual([]);
  }, CLI_TIMEOUT_MS);
});
