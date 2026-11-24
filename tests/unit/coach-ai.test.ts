import { describe, expect, it } from "vitest";
import { fakeCoachReply } from "@/features/assistant/provider";
import {
  buildUserMessage, COACH_SYSTEM, parseCoachContext, parseReply, promptPayload, redactNames, validateProposal, type CoachWorkout,
} from "@/features/coach-ai/coach-ai";

const ctx = parseCoachContext({
  workouts: [
    { label: "A", items: [
      { ref: "A1", item_id: "11111111-1111-4111-8111-111111111111", exercise: "Supino reto com barra", sets: 4, reps_min: 8, reps_max: 10, quantity_unit: "reps", load: 40, load_unit: "kg", editable: true, care_note: "hérnia" },
      { ref: "A2", item_id: "22222222-2222-4222-8222-222222222222", exercise: "Crucifixo com halteres", sets: 3, reps_min: 12, reps_max: null, quantity_unit: "reps", load: 14, load_unit: "kg", editable: true },
      { ref: "A3", item_id: "33333333-3333-4333-8333-333333333333", exercise: "Crossover na polia", sets: 3, reps_min: 10, reps_max: null, quantity_unit: "reps", load: null, load_unit: null, editable: false },
    ] },
    { label: "B", items: [
      { ref: "B1", item_id: "44444444-4444-4444-8444-444444444444", exercise: "Supino inclinado", sets: 3, reps_min: 10, reps_max: null, quantity_unit: "reps", load: 50, load_unit: "lb", editable: true },
      { ref: "B2", item_id: "55555555-5555-4555-8555-555555555555", exercise: "Remada curvada", sets: 3, reps_min: 10, reps_max: null, quantity_unit: "reps", load: 30, load_unit: "kg", editable: true },
    ] },
  ],
}) as CoachWorkout[];

describe("comando com IA: o que vai ao provedor", () => {
  it("só exercício, referência e prescrição — sem id, sem observação de saúde, sem aluno", () => {
    const msg = buildUserMessage(ctx, "supino +2,5 kg");
    expect(msg).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/); // nenhum uuid
    expect(msg).not.toContain("hérnia");
    expect(msg).toContain("\"ref\":\"A1\"");
    expect(JSON.stringify(promptPayload(ctx))).not.toMatch(/item_id|care_note|aluno|student/);
    expect(COACH_SYSTEM).toContain("Não chute");
  });
  it("nome do aluno sai do texto (palavra inteira, sem acento/caixa); palavras curtas ficam", () => {
    expect(redactNames("Aumenta o supino da Camila Freitas em 2kg", ["Camila", "Freitas"])).toBe("Aumenta o supino da o aluno o aluno em 2kg");
    expect(redactNames("camila: rosca +1kg", ["Camila"])).toBe("o aluno: rosca +1kg");
    expect(redactNames("Ângela +2 kg", ["Angela"])).toBe("o aluno +2 kg");
    expect(redactNames("supino de Ana", ["Ana", "de"])).toBe("supino de o aluno");
    expect(redactNames("Camilão", ["Camila"])).toBe("Camilão");
  });
});

describe("comando com IA: resposta validada contra a prescrição", () => {
  it("lê JSON (mesmo com texto em volta); lixo → inválido; pergunta passa", () => {
    expect(parseReply("ok {\"type\":\"question\",\"question\":\"Qual treino?\"} fim")).toEqual({ type: "question", question: "Qual treino?" });
    expect(parseReply("não sei")).toEqual({ type: "invalid" });
    expect(parseReply("{\"type\":\"hack\"}")).toEqual({ type: "invalid" });
  });
  it("proposta válida vira mudanças com o valor antigo atual", () => {
    const v = validateProposal({ type: "proposal", changes: [{ ref: "A1", field: "load", value: 42.5 }, { ref: "A2", field: "reps", value: 15 }] }, ctx);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.changes).toEqual([
      { item_id: "11111111-1111-4111-8111-111111111111", field: "load_value", old: 40, new: 42.5, unit: "kg" },
      { item_id: "22222222-2222-4222-8222-222222222222", field: "quantity_min", old: 12, new: 15 },
    ]);
    expect(v.rows[0]).toMatchObject({ workoutLabel: "A", exercise: "Supino reto com barra", before: 40, after: 42.5 });
  });
  it("qualquer item inválido derruba a proposta inteira", () => {
    const bad = (changes: { ref: string; field: string; value: unknown }[]) => validateProposal({ type: "proposal", changes }, ctx).ok;
    expect(bad([{ ref: "Z9", field: "load", value: 10 }])).toBe(false); // ref inexistente
    expect(bad([{ ref: "A3", field: "sets", value: 4 }])).toBe(false); // não editável
    expect(bad([{ ref: "A1", field: "rest", value: 60 }])).toBe(false); // campo fora da lista
    expect(bad([{ ref: "A1", field: "load", value: -5 }])).toBe(false);
    expect(bad([{ ref: "A1", field: "sets", value: 2.5 }])).toBe(false);
    expect(bad([{ ref: "A1", field: "load", value: "42" }])).toBe(false);
    expect(bad([{ ref: "A1", field: "reps_max", value: 6 }])).toBe(false); // faixa invertida (8–6)
    expect(bad([{ ref: "A1", field: "load", value: 42.5 }, { ref: "A1", field: "load", value: 45 }])).toBe(false); // repetido
    expect(bad([{ ref: "A1", field: "load", value: 40 }])).toBe(false); // nada muda
    expect(bad([])).toBe(false);
  });
});

describe("provedor falso do comando (testes)", () => {
  const ask = (cmd: string) => JSON.parse(fakeCoachReply(buildUserMessage(ctx, cmd)));
  it("propõe quando o exercício e a unidade são claros", () => {
    expect(ask("crucifixo +2 kg")).toEqual({ type: "proposal", changes: [{ ref: "A2", field: "load", value: 16 }] });
    expect(ask("remada 4 séries")).toEqual({ type: "proposal", changes: [{ ref: "B2", field: "sets", value: 4 }] });
  });
  it("pergunta quando é ambíguo (exercício em dois treinos, nenhum exercício, unidade diferente)", () => {
    expect(ask("supino +2,5 kg").type).toBe("question"); // supino reto (A) e inclinado (B)
    expect(ask("supino treino B +5 lb")).toEqual({ type: "proposal", changes: [{ ref: "B1", field: "load", value: 55 }] });
    expect(ask("supino treino B +5 kg").type).toBe("question"); // B1 está em lb
    expect(ask("aumenta tudo").type).toBe("question");
  });
});
