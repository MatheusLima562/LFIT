import { describe, expect, it } from "vitest";
import { formatAverage, formatNps, isNpsSummary, quarterLabel, reminderOutcome, statusText } from "@/features/nps/nps";

describe("NPS v2: regras de exibição", () => {
  it("formata NPS com sinal e média com vírgula", () => {
    expect(formatNps(42)).toBe("+42");
    expect(formatNps(0)).toBe("0");
    expect(formatNps(-15)).toBe("−15");
    expect(formatAverage(8.4)).toBe("8,4");
    expect(formatAverage(9)).toBe("9,0");
  });

  it("rótulo do trimestre", () => {
    expect(quarterLabel("2026-01-01")).toBe("1º tri 2026");
    expect(quarterLabel("2026-07-01")).toBe("3º tri 2026");
  });

  it("aceita só o resumo v2 (o v1 trazia aluno, nota e comentário)", () => {
    expect(isNpsSummary({ min_n: 10, quarter_start: "2026-07-01", headline: { enough: false }, quarters: [], by_trainer: null })).toBe(true);
    expect(isNpsSummary({ n: 1, nps: null, detractor_list: [{ student_name: "X", score: 3 }], quarters: [] })).toBe(false);
    expect(isNpsSummary(null)).toBe(false);
  });

  it("estado para o professor: 'Agora não' aparece só como indisponível, resposta nunca aparece", () => {
    expect(statusText({ state: "pending" })).toBe("O aluno pode avaliar e ainda não respondeu.");
    expect(statusText({ state: "unavailable" })).toBe("Avaliação indisponível no momento.");
    expect(statusText({ state: "unavailable" })).not.toMatch(/agora não|recus|\d{2}\/\d{2}/i);
    expect(statusText({ state: "none" })).toBe("Nenhuma avaliação pendente para este aluno agora.");
    expect(statusText({ state: "not_yet", reason: "few_sessions", sessions_done: 5, sessions_needed: 8 })).toContain("8 treinos concluídos; até agora são 5");
    expect(statusText({ state: "not_yet", reason: "too_early", available_on: "2026-11-15", days_needed: 30, sessions_done: 3, sessions_needed: 8 })).toContain(
      "30 dias depois do primeiro treino concluído, a partir de 15/11/2026 (3 de 8",
    );
    expect(statusText({ state: "not_yet", reason: "too_early", available_on: null, days_needed: 30, sessions_needed: 8 })).toContain("nenhum treino");
  });

  it("resultado do lembrete", () => {
    expect(reminderOutcome({ state: "pending", sent: true, reminded_at: "2026-10-29T12:00:00Z" })).toEqual({ ok: true, text: "Lembrete enviado: o aluno verá no cartão de avaliação." });
    expect(reminderOutcome({ state: "pending", sent: false, already: true, reminded_at: "2026-10-20T12:00:00Z" }).text).toBe("Lembrete já enviado em 20/10/2026.");
    expect(reminderOutcome({ state: "unavailable", sent: false })).toEqual({ ok: false, text: "Avaliação indisponível no momento." });
  });
});
