import { describe, expect, it } from "vitest";
import { formatNps, npsCategory, npsScore, quarterLabel, requestOutcome } from "@/features/nps/nps";

describe("NPS: regras de exibição", () => {
  it("classifica 9–10 promotor, 7–8 neutro, 0–6 detrator", () => {
    expect([0, 6, 7, 8, 9, 10].map(npsCategory)).toEqual(["detractor", "detractor", "passive", "passive", "promoter", "promoter"]);
  });

  it("NPS só com 10+ respostas, arredondado", () => {
    expect(npsScore(5, 1, 9)).toBeNull();
    expect(npsScore(0, 0, 0)).toBeNull();
    expect(npsScore(6, 2, 10)).toBe(40);
    expect(npsScore(1, 2, 12)).toBe(-8);
  });

  it("formata com sinal e travessão quando não há valor", () => {
    expect(formatNps(42)).toBe("+42");
    expect(formatNps(0)).toBe("0");
    expect(formatNps(-15)).toBe("−15");
    expect(formatNps(null)).toBe("—");
  });

  it("rótulo do trimestre", () => {
    expect(quarterLabel("2026-01-01")).toBe("1º tri 2026");
    expect(quarterLabel("2026-10-01")).toBe("4º tri 2026");
  });

  it("motivo para o professor quando o aluno ainda não pode responder", () => {
    expect(requestOutcome({ eligible: true, reason: null, requested: true, already: false })).toEqual({ ok: true, text: expect.stringContaining("próxima vez") });
    expect(requestOutcome({ eligible: true, reason: null, requested: true, already: true }).text).toContain("já está feito");
    expect(requestOutcome({ eligible: false, reason: "recent_response", available_on: "2027-01-20", requested: false }).text).toContain("20/01/2027");
    expect(requestOutcome({ eligible: false, reason: "too_early", available_on: "2026-11-15", sessions_done: 3, requested: false }).text).toContain("15/11/2026 (3 de 8");
    expect(requestOutcome({ eligible: false, reason: "too_early", available_on: null, sessions_done: 0, requested: false }).text).toContain("nenhum treino");
    expect(requestOutcome({ eligible: false, reason: "few_sessions", sessions_done: 5, requested: false })).toEqual({ ok: false, text: expect.stringContaining("são 5") });
    expect(requestOutcome({ eligible: false, reason: "inactive", requested: false }).ok).toBe(false);
    expect(requestOutcome({ eligible: true, reason: "snoozed", available_on: "2026-11-12", requested: false })).toEqual({
      ok: false,
      text: expect.stringContaining("Agora não\"). O pedido não foi registrado; tente de novo a partir de 12/11/2026"),
    });
  });
});
