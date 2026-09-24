import { describe, expect, it } from "vitest";
import { formatIntensity, formatQuantity, formatRestRange, formatSpeed } from "@/features/plans/prescription";

describe("formatação da prescrição", () => {
  it("quantidade por unidade", () => {
    expect(formatQuantity("reps", 8, 12, null)).toBe("8–12 reps");
    expect(formatQuantity("reps", 8, null, "por lado")).toBe("8 reps por lado");
    expect(formatQuantity("seconds", 20, 30, null)).toBe("20–30 s");
    expect(formatQuantity("km", 1.5, null, null)).toBe("1,5 km");
    expect(formatQuantity("failure", null, null, null)).toBe("Até a falha");
    expect(formatQuantity("reps", null, null, null)).toBeNull();
  });
  it("intensidade, velocidade e pausa", () => {
    expect([formatIntensity("pct_1rm", 75), formatIntensity("rpe", 7.5), formatIntensity("rir", 2), formatIntensity(null, 3)]).toEqual(["75% 1RM", "RPE 7,5", "RIR 2", null]);
    expect([formatSpeed("slow", null), formatSpeed(null, "3010"), formatSpeed(null, null)]).toEqual(["Lenta", "Cadência 3010", null]);
    expect([formatRestRange(60, 90), formatRestRange(45, null), formatRestRange(120, 180), formatRestRange(60, 60), formatRestRange(null, null)]).toEqual([
      "60–90 s",
      "45 s",
      "2–3 min",
      "1 min",
      null,
    ]);
  });
});
