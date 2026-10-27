import { describe, expect, it } from "vitest";
import { cardLabels, SOON_INDICATORS } from "@/components/dashboard/CustomizeSheet";

/**
 * "Personalizar dashboard": só módulos que ainda não existem aparecem desabilitados, com "Em breve" e o motivo — nunca no
 * grid do Início (isso é garantido à parte por DashboardView, que só lista `cards` recebidos da página).
 */
describe("CustomizeSheet: indicadores 'Em breve'", () => {
  it("cada item tem rótulo e motivo (sem texto vazio); ids únicos", () => {
    const ids = new Set<string>();
    for (const item of SOON_INDICATORS) {
      expect(item.label.trim().length, item.id).toBeGreaterThan(0);
      expect(item.reason.trim().length, item.id).toBeGreaterThan(0);
      expect(ids.has(item.id), `id duplicado: ${item.id}`).toBe(false);
      ids.add(item.id);
    }
  });

  it("só Avaliação física e Vendas continuam 'Em breve' (módulos que não existem)", () => {
    expect(SOON_INDICATORS.map((i) => i.label)).toEqual([cardLabels.assessment, cardLabels.sales]);
  });

  it("indicadores com dados reais não aparecem como 'Em breve'", () => {
    const ids = SOON_INDICATORS.map((i) => i.id);
    for (const real of ["satisfaction", "completed", "topStudents", "weeklyWorkouts", "retencao", "engajamento", "treinos-30"]) {
      expect(ids, real).not.toContain(real);
    }
  });
});
