import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SatisfactionCard } from "@/components/dashboard/SatisfactionCard";
import { TopStudentsCard } from "@/components/dashboard/TopStudentsCard";

/** Estados vazios dos cards do Início (sem avaliações / sem treinos marcados). */
describe("Início: estados vazios", () => {
  it("Satisfação sem avaliações: mensagem vazia, sem nota, estrelas, veredito ou NaN", () => {
    const html = renderToStaticMarkup(
      createElement(SatisfactionCard, {
        data: { average: 0, total: 0, distribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: 0 })), latest: null },
        referenceDate: "2026-09-25T12:00:00-03:00",
      }),
    );
    expect(html).toContain("Nenhuma avaliação nos últimos 30 dias.");
    expect(html).not.toMatch(/NaN|Infinity|Precisa de atenção|Excelente|Baseado em|Distribuição das avaliações/);
    // O link "Ver todos feedbacks" continua desabilitado ("Em breve"), sem link morto.
    expect(html).not.toContain('href="/feedbacks"');
  });

  it("Top 5 sem treinos: mensagem vazia, sem ranking nem posições vazias", () => {
    const html = renderToStaticMarkup(createElement(TopStudentsCard, { students: [] }));
    expect(html).toContain("Nenhum treino marcado nos últimos 30 dias.");
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
