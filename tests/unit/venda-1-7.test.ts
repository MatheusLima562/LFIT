import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TIME_ZONES } from "@/features/settings/settings";
import { messages } from "@/messages/pt-BR";
import { isTestOrg, isTestUserEmail } from "../../scripts/test-data-filters.mts";

const SQL = readFileSync(join(process.cwd(), "supabase/migrations/20261120170000_time_zone_retention.sql"), "utf8");

describe("1.7 — ajustes", () => {
  it("lista de fusos do código = a do banco; todos com rótulo em pt-BR", () => {
    const block = SQL.slice(SQL.indexOf("select array["), SQL.indexOf("]\n$$;"));
    expect([...block.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...TIME_ZONES]);
    for (const z of TIME_ZONES) expect(messages.settings.timeZone.zones[z], z).toBeTruthy();
  });
  it("helpers de calendário leem o fuso da conta de quem chama", () => {
    for (const fn of ["today_br", "sp_day_start", "sp_day"]) {
      const body = SQL.slice(SQL.indexOf(`create or replace function private.${fn}(`));
      expect(body.slice(0, 300), fn).toContain("private.current_time_zone()");
    }
  });
  it("botão fixo do Hoje: 'Começar treino {letra}'", () => {
    expect(messages.aluno.today.startFixed("B")).toBe("Começar treino B");
  });
  it("limpeza de testes: só e-mails lfit-test-…@example.com e organizações lfit-test- fora do seed", () => {
    expect(isTestUserEmail("lfit-test-1a2b3c4d+owner-abc123@example.com")).toBe(true);
    expect(isTestUserEmail("lfit-test-plataforma-xyz@example.com")).toBe(true);
    expect(isTestUserEmail("owner.seed@example.com")).toBe(false);
    expect(isTestUserEmail("lfit-test-x@gmail.com")).toBe(false);
    expect(isTestUserEmail("matheus@empresa.com")).toBe(false);
    expect(isTestUserEmail(null)).toBe(false);
    expect(isTestOrg({ name: "lfit-test-1a2b3c4d live", is_seed: false })).toBe(true);
    expect(isTestOrg({ name: "lfit-test-x", is_seed: true })).toBe(false);
    expect(isTestOrg({ name: "Studio Exemplo (fictício)", is_seed: false })).toBe(false);
  });
});
