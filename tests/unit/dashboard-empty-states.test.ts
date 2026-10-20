import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompletedWorkoutsCard } from "@/components/dashboard/CompletedWorkoutsCard";
import { SatisfactionCard } from "@/components/dashboard/SatisfactionCard";
import { TopStudentsCard } from "@/components/dashboard/TopStudentsCard";
import { WeeklyWorkoutsCard } from "@/components/dashboard/WeeklyWorkoutsCard";
import { satisfaction, trainingMetrics } from "@/features/dashboard/stats";

/** Estados vazios e conteúdo dos cards do Início (dados reais — docs/planos/dashboard-inicio.md). */
describe("Início: cards com dados reais", () => {
  it("Satisfação: média com a quantidade de notas, só agregados, sem link morto nem âmbar decorativo", () => {
    const data = satisfaction({
      today: "2026-10-21",
      engagement: { active_students: 1, trained_7d: 1 },
      retention: { base_31_60: 0, retained_0_30: 0 },
      history_since: null,
      satisfaction: { ratings: 12, average: 4.58, distribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: stars === 5 ? 8 : stars === 4 ? 4 : 0 })) },
    });
    const html = renderToStaticMarkup(createElement(SatisfactionCard, { data: data! }));
    expect(html).toContain("4,6 · 12 notas");
    expect(html).not.toMatch(/NaN|Infinity|href="\/feedbacks"|amber/);
  });

  it("Satisfação sem nenhuma nota: o card não é montado", () => {
    expect(
      satisfaction({
        today: "2026-10-21",
        engagement: { active_students: 1, trained_7d: 0 },
        retention: { base_31_60: 0, retained_0_30: 0 },
        history_since: null,
        satisfaction: { ratings: 0, average: null, distribution: [] },
      }),
    ).toBeNull();
  });

  it("Treinos concluídos sem treino hoje: mensagem vazia, zero e a comparação, sem 'Ao vivo'", () => {
    const html = renderToStaticMarkup(createElement(CompletedWorkoutsCard, { items: [], count: 0, comparison: "2 na quarta passada" }));
    expect(html).toContain("Nenhum treino concluído hoje.");
    expect(html).toContain("0 hoje");
    expect(html).toContain("2 na quarta passada");
    expect(html).not.toMatch(/Ao vivo|NaN/);
  });

  it("Treinos da semana sem nenhum treino: aviso de vazio", () => {
    const data = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day, i) => ({ day, current: i < 3 ? 0 : null, oneWeekAgo: 0, twoWeeksAgo: 0 }));
    const html = renderToStaticMarkup(createElement(WeeklyWorkoutsCard, { data, lastWeekToDate: 0 }));
    expect(html).toContain("Nenhum treino concluído nas últimas 3 semanas.");
    expect(html).not.toMatch(/NaN|Infinity/);
  });

  it("Top 5 sem treinos: mensagem vazia, sem ranking nem posições vazias", () => {
    const html = renderToStaticMarkup(createElement(TopStudentsCard, { students: [] }));
    expect(html).toContain("Nenhum treino concluído nos últimos 30 dias.");
    expect(html).not.toMatch(/Posição disponível|NaN|Infinity|<ol/);
  });

  it("Top 5 com 1 aluno: 1 posição e 4 vagas", () => {
    const html = renderToStaticMarkup(createElement(TopStudentsCard, { students: [{ id: "a", name: "Aluno Exemplo", workouts: 2 }] }));
    expect(html).toContain("Aluno Exemplo");
    expect(html.match(/Posição disponível/g)).toHaveLength(4);
  });
});

describe("Início: banner de oferta", () => {
  // Ao entregar Vendas → Planos (rota "available"), o banner volta sozinho e este teste deve ser atualizado.
  it("fica escondido enquanto o destino (/vendas/planos) não estiver disponível", async () => {
    const { banner } = await import("@/data/dashboard");
    const { isAvailableRoute } = await import("@/data/navigation");
    expect(isAvailableRoute(banner.href)).toBe(false);
  });
});

describe("Início: indicadores só com dados reais", () => {
  it("sem as RPCs do dashboard (ou se falharem), nenhum tile de treino, engajamento ou retenção", () => {
    expect(trainingMetrics(null, null)).toEqual([]);
  });

  it("a página não usa mais os mocks de lib/dashboard", async () => {
    const { readFileSync } = await import("node:fs");
    const page = readFileSync("app/(app)/page.tsx", "utf8");
    expect(page).not.toMatch(/lib\/dashboard|getDashboardSummary|visibleMetrics/);
  });
});
