import { describe, expect, it } from "vitest";
import { ageFrom, formatDate, formatEnrollment } from "@/lib/format";
import { searchKey, slugify } from "@/lib/text";

describe("formatação", () => {
  it("matrícula com zeros à esquerda só na exibição", () => {
    expect(formatEnrollment(7)).toBe("#0007");
    expect(formatEnrollment(12345)).toBe("#12345");
  });

  it("idade considera se o aniversário já passou", () => {
    const today = new Date(2026, 8, 23); // 23/09/2026
    expect(ageFrom("1990-09-23", today)).toBe(36);
    expect(ageFrom("1990-09-24", today)).toBe(35);
    expect(ageFrom("1990-12-01", today)).toBe(35);
  });

  it("datas puras não sofrem deslocamento de fuso", () => {
    expect(formatDate("2026-01-01")).toBe("01/01/2026");
  });

  it("timestamps são exibidos em America/Sao_Paulo", () => {
    expect(formatDate("2026-09-24T02:00:00Z")).toBe("23/09/2026"); // 23h do dia 23 em SP
  });

  it("busca e slug sem acento", () => {
    expect(searchKey("Fábio CONCEIÇÃO")).toBe("fabio conceicao");
    expect(slugify("Estúdio São João — Pilates!")).toBe("estudio-sao-joao-pilates");
  });
});
