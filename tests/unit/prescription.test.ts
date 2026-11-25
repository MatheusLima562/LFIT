import { describe, expect, it } from "vitest";
import {
  bulkChanges, bulkProgression, computeSuggestions, describeChange, groupBySession, mergeChanges, mode, parseHistory, parseReview,
  roundToStep, stepLoad, stepReps, stepSets, type QuickItem, type ReviewItem,
} from "@/features/prescription/prescription";

const item = (o: Partial<QuickItem> = {}): QuickItem => ({
  id: "i1", exerciseName: "Supino", sets: 3, quantityMin: 10, quantityMax: null, quantityUnit: "reps",
  loadValue: 40, loadUnit: "kg", loadText: null, detailed: false, ...o,
});
const review = (o: Partial<ReviewItem> = {}): ReviewItem => ({
  itemId: "i1", workoutLabel: "A", exerciseName: "Supino", sets: 3, quantityMin: 10, quantityMax: null, quantityUnit: "reps",
  loadValue: 40, loadUnit: "kg", loadText: null, detailed: false, sessionId: "s1", sessionFinishedAt: "2026-11-24T10:00:00Z",
  logs: [], dismissed: [], ...o,
});
const logs = (pairs: [number | null, number | null][]) => pairs.map(([l, q]) => ({ loadValue: l, loadUnit: "kg" as const, quantityValue: q }));

describe("edição rápida: +/−", () => {
  it("carga anda um passo; sem carga começa no passo; nunca negativa; texto/detalhado não editam", () => {
    expect(stepLoad(item(), 2.5, 1)).toEqual([{ item_id: "i1", field: "load_value", old: 40, new: 42.5, unit: "kg" }]);
    expect(stepLoad(item({ loadValue: 1 }), 2.5, -1)[0]!.new).toBe(0);
    expect(stepLoad(item({ loadValue: 0 }), 2.5, -1)).toEqual([]);
    expect(stepLoad(item({ loadValue: null, loadUnit: null }), 2.5, 1)).toEqual([{ item_id: "i1", field: "load_value", old: null, new: 2.5, unit: "kg" }]);
    expect(stepLoad(item({ loadText: "moderada" }), 2.5, 1)).toEqual([]);
    expect(stepLoad(item({ detailed: true }), 2.5, 1)).toEqual([]);
    expect(stepLoad(item({ loadValue: 20, loadUnit: "lb" }), 5, 1)[0]).toMatchObject({ new: 25, unit: "lb" });
  });
  it("repetições: valor fixo muda 1; faixa anda inteira; mínimo 1; só em repetições", () => {
    expect(stepReps(item(), 1)).toEqual([{ item_id: "i1", field: "quantity_min", old: 10, new: 11 }]);
    expect(stepReps(item({ quantityMin: 8, quantityMax: 10 }), 1)).toEqual([
      { item_id: "i1", field: "quantity_min", old: 8, new: 9 }, { item_id: "i1", field: "quantity_max", old: 10, new: 11 },
    ]);
    expect(stepReps(item({ quantityMin: 10, quantityMax: 10 }), -1)).toEqual([
      { item_id: "i1", field: "quantity_min", old: 10, new: 9 }, { item_id: "i1", field: "quantity_max", old: 10, new: 9 },
    ]);
    expect(stepReps(item({ quantityMin: 1 }), -1)).toEqual([]);
    expect(stepReps(item({ quantityUnit: "seconds" }), 1)).toEqual([]);
  });
  it("séries de 1 a 20", () => {
    expect(stepSets(item(), 1)).toEqual([{ item_id: "i1", field: "sets", old: 3, new: 4 }]);
    expect(stepSets(item({ sets: 1 }), -1)).toEqual([]);
    expect(stepSets(item({ sets: 20 }), 1)).toEqual([]);
  });
  it("toques seguidos viram UMA gravação (old do primeiro, new do último); voltar ao original não grava", () => {
    expect(mergeChanges([
      { item_id: "i1", field: "load_value", old: 40, new: 42.5 }, { item_id: "i1", field: "load_value", old: 42.5, new: 45 },
      { item_id: "i1", field: "sets", old: 3, new: 4 }, { item_id: "i1", field: "sets", old: 4, new: 3 },
    ])).toEqual([{ item_id: "i1", field: "load_value", old: 40, new: 45 }]);
  });
});

describe("progressão em lote", () => {
  const w = { id: "w", label: "A", name: null, items: [
    item({ id: "a", exerciseName: "Supino", loadValue: 40 }),
    item({ id: "b", exerciseName: "Crucifixo", loadValue: 12 }),
    item({ id: "c", exerciseName: "Flexão", loadValue: null }),
    item({ id: "d", exerciseName: "Crossover", loadText: "leve" }),
    item({ id: "e", exerciseName: "Pullover", loadValue: 1 }),
  ] };
  it("+5% arredondado ao passo; quem não tem carga numérica ou não muda fica de fora", () => {
    const { rows, skipped } = bulkProgression(w, 5, 2.5);
    expect(rows).toEqual([
      { itemId: "a", exerciseName: "Supino", before: 40, after: 42.5, unit: "kg" },
      { itemId: "b", exerciseName: "Crucifixo", before: 12, after: 12.5, unit: "kg" }, // 12,6 → 12,5
    ]);
    // Pullover 1 kg: +5% arredondado ao passo daria 0 → nunca diminui numa progressão.
    expect(skipped).toEqual(["Flexão", "Crossover", "Pullover"]);
    expect(bulkProgression(w, -50, 2.5).rows.map((r) => r.itemId)).not.toContain("e"); // redução nunca zera
  });
  it("percentual inválido não gera nada; redução funciona", () => {
    expect(bulkProgression(w, 0, 2.5).rows).toEqual([]);
    expect(bulkProgression(w, 80, 2.5).rows).toEqual([]);
    expect(bulkProgression(w, -10, 2.5).rows[0]).toMatchObject({ itemId: "a", after: 35 });
    expect(bulkChanges(bulkProgression(w, 10, 2.5).rows)[0]).toEqual({ item_id: "a", field: "load_value", old: 40, new: 45, unit: "kg" });
  });
  it("arredondamento ao passo", () => {
    expect(roundToStep(44.1, 2.5)).toBe(45);
    expect(roundToStep(43.7, 2.5)).toBe(42.5);
    expect(roundToStep(10.3, 0.5)).toBe(10.5);
  });
});

describe("sugestões 'Atualizar prescrição para X?'", () => {
  it("carga: valor mais usado (empate → maior) diferente do prescrito", () => {
    expect(mode([40, 42.5, 42.5, 40])).toBe(42.5);
    const s = computeSuggestions([review({ logs: logs([[42.5, 10], [42.5, 10], [40, 10]]) })]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kind: "load", target: "42,5 kg", current: "40 kg" });
    expect(s[0]!.changes).toEqual([{ item_id: "i1", field: "load_value", old: 40, new: 42.5, unit: "kg" }]);
  });
  it("igual ao prescrito, dispensado, carga em texto ou séries detalhadas → nada", () => {
    expect(computeSuggestions([review({ logs: logs([[40, 10]]) })])).toEqual([]);
    expect(computeSuggestions([review({ logs: logs([[45, 10]]), dismissed: ["load_value"] })])).toEqual([]);
    expect(computeSuggestions([review({ logs: logs([[45, 10]]), loadText: "leve" })])).toEqual([]);
    expect(computeSuggestions([review({ logs: logs([[45, 12]]), detailed: true })])).toEqual([]);
  });
  it("repetições fixas: valor diferente; faixa: só fora da faixa, mantendo a largura", () => {
    const fixed = computeSuggestions([review({ logs: logs([[40, 12], [40, 12], [40, 11]]) })]);
    expect(fixed).toEqual([expect.objectContaining({ kind: "reps", target: "12 reps" })]);
    expect(fixed[0]!.changes).toEqual([{ item_id: "i1", field: "quantity_min", old: 10, new: 12 }]);
    expect(computeSuggestions([review({ quantityMin: 8, quantityMax: 10, logs: logs([[40, 9], [40, 10]]) })])).toEqual([]);
    const above = computeSuggestions([review({ quantityMin: 8, quantityMax: 10, logs: logs([[40, 12], [40, 12]]) })]);
    expect(above[0]).toMatchObject({ target: "10–12 reps", current: "8–10 reps" });
    expect(above[0]!.changes).toEqual([
      { item_id: "i1", field: "quantity_min", old: 8, new: 10 }, { item_id: "i1", field: "quantity_max", old: 10, new: 12 },
    ]);
    expect(computeSuggestions([review({ logs: logs([[40, 12]]), dismissed: ["quantity"] })])).toEqual([]);
  });
  it("agrupa por sessão, a mais recente primeiro", () => {
    const s = computeSuggestions([
      review({ itemId: "a", sessionId: "old", sessionFinishedAt: "2026-11-20T10:00:00Z", logs: logs([[45, 10]]) }),
      review({ itemId: "b", sessionId: "new", sessionFinishedAt: "2026-11-24T10:00:00Z", logs: logs([[45, 10]]) }),
      review({ itemId: "c", sessionId: "new", sessionFinishedAt: "2026-11-24T10:00:00Z", logs: logs([[40, 15]]) }),
    ]);
    const g = groupBySession(s);
    expect(g.map((x) => [x.sessionId, x.suggestions.length])).toEqual([["new", 2], ["old", 1]]);
  });
});

describe("leitura defensiva e textos", () => {
  it("review e histórico ignoram lixo e campos estranhos", () => {
    expect(parseReview({ items: [{ item_id: 1 }, null, { item_id: "x", session_id: "s", logs: [{ load_value: "42.5", load_unit: "kg", quantity_value: 10 }], pain: 9 }] }))
      .toEqual([expect.objectContaining({ itemId: "x", logs: [{ loadValue: 42.5, loadUnit: "kg", quantityValue: 10 }] })]);
    const h = parseHistory([{ batch_id: "b", source: "hack", changes: [{ field: "rest", old: 1, new: 2 }, { field: "sets", old: 3, new: 4, unit: "sets" }] }]);
    expect(h[0]).toMatchObject({ source: "quick", changes: [{ field: "sets", old: 3, new: 4 }] });
  });
  it("antes → depois legível", () => {
    expect(describeChange({ field: "load_value", old: 40, new: 42.5, unit: "kg" })).toBe("40 → 42,5 kg");
    expect(describeChange({ field: "sets", old: 3, new: 4, unit: "sets" })).toBe("3 → 4 séries");
    expect(describeChange({ field: "quantity_max", old: 10, new: 12, unit: "reps" })).toBe("10 → 12 reps (máx.)");
  });
});
