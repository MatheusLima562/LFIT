import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GUIDES } from "@/features/knowledge/guides";
import { getGuide, guideKeyFor } from "@/features/knowledge/guide-for";

/** Chaves das condições globais criadas pelas migrations. */
function globalConditionKeys() {
  const dir = join(process.cwd(), "supabase/migrations");
  const keys = new Set<string>();
  for (const f of readdirSync(dir)) {
    const sql = readFileSync(join(dir, f), "utf8");
    if (!sql.includes("health_conditions (key")) continue;
    for (const m of sql.matchAll(/\(\s*'([a-z_]+)',\s*'[^']+'/g)) keys.add(m[1]);
  }
  return keys;
}

describe("Guias (2.10 Fase B)", () => {
  it("10 Guias, cada um ligado a uma condição global existente", () => {
    const keys = globalConditionKeys();
    expect(Object.keys(GUIDES).sort()).toEqual(
      [
        "cervical",
        "dor_lombar_extensao",
        "dor_lombar_flexao",
        "espondilolistese_extensao",
        "estenose_lombar_extensao",
        "hernia_lombar_flexao",
        "joelho_artrose",
        "joelho_patelofemoral",
        "lombar",
        "ombro_manguito",
      ].sort(),
    );
    for (const [key, g] of Object.entries(GUIDES)) {
      expect(keys.has(key), key).toBe(true);
      expect(g.key).toBe(key);
    }
  });

  it("conteúdo completo; toda citação tem referência; nada de termos internos da revisão", () => {
    for (const g of Object.values(GUIDES)) {
      expect(g.summary.length, g.key).toBeGreaterThanOrEqual(5);
      expect(g.redFlags.length, g.key).toBeGreaterThan(0);
      expect(g.phrases.length, g.key).toBeGreaterThan(0);
      const body = JSON.stringify([g.summary, g.tables, g.notes, g.redFlags]);
      const cited = new Set([...body.matchAll(/\[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/\b([A-Z]\d{1,2})\b/g)].map((x) => x[1])));
      const refs = new Set(g.references.map((r) => r.id));
      for (const id of cited) expect(refs.has(id), `${g.key}: ${id}`).toBe(true);
      expect(body).not.toMatch(/CSV|aprovad|documento-base|Fase B/);
      for (const tb of g.tables) for (const r of tb.rows) expect(r).toHaveLength(tb.columns.length);
    }
  });

  it("alertas: só as condições com regras aprovadas têm tabela de alerta", () => {
    const withAlerts = Object.values(GUIDES)
      .filter((g) => g.tables.some((t) => t.kind === "alert"))
      .map((g) => g.key)
      .sort();
    expect(withAlerts).toEqual(
      ["dor_lombar_extensao", "dor_lombar_flexao", "espondilolistese_extensao", "estenose_lombar_extensao", "hernia_lombar_flexao", "ombro_manguito"].sort(),
    );
  });

  it("condição sem Guia próprio usa o da região; sem nenhum → null", () => {
    expect(guideKeyFor({ key: "joelho_artrose", parentKey: "joelho" })).toBe("joelho_artrose");
    expect(guideKeyFor({ key: null, parentKey: "lombar" })).toBe("lombar");
    expect(guideKeyFor({ key: "hipertensao", parentKey: null })).toBeNull();
    expect(getGuide("toString")).toBeNull();
  });
});
