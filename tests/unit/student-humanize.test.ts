import { describe, expect, it } from "vitest";
import {
  consistency,
  greeting,
  hourInSaoPaulo,
  initials,
  keyboardLikelyOpen,
  recordNames,
  workoutDayLabel,
} from "@/features/student-app/humanize";

// São Paulo = UTC−3 (sem horário de verão desde 2019).
const sp = (isoLocal: string) => new Date(`${isoLocal}-03:00`);

describe("saudação pelo horário de São Paulo", () => {
  it("bom dia, boa tarde, boa noite nos limites", () => {
    expect(greeting("Camila", sp("2026-10-17T04:59:00"))).toBe("Boa noite, Camila!");
    expect(greeting("Camila", sp("2026-10-17T05:00:00"))).toBe("Bom dia, Camila!");
    expect(greeting("Camila", sp("2026-10-17T11:59:00"))).toBe("Bom dia, Camila!");
    expect(greeting("Camila", sp("2026-10-17T12:00:00"))).toBe("Boa tarde, Camila!");
    expect(greeting("Camila", sp("2026-10-17T17:59:00"))).toBe("Boa tarde, Camila!");
    expect(greeting("Camila", sp("2026-10-17T18:00:00"))).toBe("Boa noite, Camila!");
  });

  it("perto da meia-noite usa o relógio de SP, não o UTC", () => {
    // 23:59 em SP = 02:59 UTC do dia seguinte; 00:30 em SP = 03:30 UTC.
    expect(hourInSaoPaulo(new Date("2026-10-18T02:59:00Z"))).toBe(23);
    expect(greeting("Camila", new Date("2026-10-18T02:59:00Z"))).toBe("Boa noite, Camila!");
    expect(hourInSaoPaulo(new Date("2026-10-18T03:30:00Z"))).toBe(0);
    expect(greeting("Camila", new Date("2026-10-18T03:30:00Z"))).toBe("Boa noite, Camila!");
    // 08:00 UTC = 05:00 em SP: já é "bom dia" (em UTC seria outra faixa se usássemos o relógio errado).
    expect(greeting("Camila", new Date("2026-10-18T08:00:00Z"))).toBe("Bom dia, Camila!");
  });
});

describe("constância (sem cobrança)", () => {
  it("0, 1 e N treinos no mês", () => {
    expect(consistency(0, 0)).toEqual({ headline: "Seu primeiro treino do mês está esperando por você.", detail: null });
    expect(consistency(1, 1)).toEqual({ headline: "1 treino este mês", detail: null });
    expect(consistency(3, 2)).toEqual({ headline: "3 treinos este mês", detail: "2 semanas seguidas treinando" });
  });
  it("sequência só a partir de 2 semanas", () => {
    expect(consistency(5, 1).detail).toBeNull();
    expect(consistency(5, 4).detail).toBe("4 semanas seguidas treinando");
  });
});

describe("recordes (selo discreto)", () => {
  it("só is_pr com carga anterior; um selo por exercício", () => {
    expect(
      recordNames([
        { exercise_name: "Supino reto com barra", best_load_now: 42.5, prior_best: 40, is_pr: true },
        { exercise_name: "Supino reto com barra", best_load_now: 95, prior_best: 90, is_pr: true }, // mesma carga em lb
        { exercise_name: "Remada curvada com barra", best_load_now: 30, prior_best: 30, is_pr: false },
        { exercise_name: "Agachamento goblet", best_load_now: 20, prior_best: null, is_pr: false }, // primeira vez
      ]),
    ).toEqual(["Supino reto com barra"]);
    expect(recordNames([])).toEqual([]);
  });
});

describe("dia do treino", () => {
  const now = sp("2026-10-17T10:00:00"); // sábado
  it("hoje, ontem e dia da semana (em SP)", () => {
    expect(workoutDayLabel(sp("2026-10-17T07:00:00").toISOString(), now)).toBe("de hoje");
    expect(workoutDayLabel(sp("2026-10-16T22:30:00").toISOString(), now)).toBe("de ontem"); // 01:30 UTC do dia 17
    expect(workoutDayLabel(sp("2026-10-13T08:00:00").toISOString(), now)).toBe("de terça");
  });
});

describe("iniciais e teclado", () => {
  it("iniciais do professor", () => {
    expect(initials("Caio Exemplo")).toBe("CE");
    expect(initials("Bianca da Silva Exemplo")).toBe("BE");
    expect(initials("Rafael")).toBe("R");
    expect(initials(null)).toBe("?");
  });
  it("teclado aberto quando a área visível encolhe bastante", () => {
    expect(keyboardLikelyOpen(812, 812)).toBe(false);
    expect(keyboardLikelyOpen(740, 812)).toBe(false); // barra do Safari
    expect(keyboardLikelyOpen(480, 812)).toBe(true);
  });
});
