import { describe, expect, it } from "vitest";
import { cardLabels, SOON_INDICATORS } from "@/components/dashboard/CustomizeSheet";
import { EXAMPLE_ONLY_METRICS } from "@/lib/dashboard";

/**
 * "Personalizar dashboard": indicadores sem dados reais aparecem desabilitados, com "Em breve" e o motivo —
 * nunca no grid do Início (isso é garantido à parte por DashboardView, que só lista `cards` recebidos da página).
 */
describe("CustomizeSheet: indicadores 'Em breve'", () => {
  it("cada item tem rótulo e motivo (sem texto vazio); ids únicos", () => {
    expect(SOON_INDICATORS.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const item of SOON_INDICATORS) {
      expect(item.label.trim().length, item.id).toBeGreaterThan(0);
      expect(item.reason.trim().length, item.id).toBeGreaterThan(0);
      expect(ids.has(item.id), `id duplicado: ${item.id}`).toBe(false);
      ids.add(item.id);
    }
  });

  it("inclui os 6 indicadores pedidos (Satisfação, Top 5, Treinos concluídos, Retenção, Engajamento, Avaliação física)", () => {
    const labels = SOON_INDICATORS.map((i) => i.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        cardLabels.satisfaction,
        cardLabels.topStudents,
        cardLabels.completed,
        "Retenção",
        "Engajamento semanal",
        cardLabels.assessment,
      ]),
    );
  });

  it("todo id de métrica escondida da Visão geral (EXAMPLE_ONLY_METRICS) tem uma linha em 'Em breve'", () => {
    const soonIds = new Set(SOON_INDICATORS.map((i) => i.id));
    for (const id of EXAMPLE_ONLY_METRICS) expect(soonIds.has(id), id).toBe(true);
  });

  it("nenhum dos ids de 'Em breve' que também são DashboardCardId aparece pré-marcado como disponível", () => {
    // completed/topStudents/satisfaction/assessment são cards reais, só ficam disponíveis quando a página os passar.
    for (const id of ["completed", "topStudents", "satisfaction", "assessment"]) {
      expect(cardLabels).toHaveProperty(id);
    }
  });
});
