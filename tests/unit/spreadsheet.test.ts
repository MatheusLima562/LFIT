import { describe, expect, it } from "vitest";
import { csvCell, neutralizeFormula, toCsv, xlsxCell } from "@/lib/spreadsheet";
import { rejectedCsv, templateCsv } from "@/features/import/validate";
import { messages } from "@/messages/pt-BR";

describe("injeção de fórmula", () => {
  it("neutraliza =, +, -, @, tab e CR no início", () => {
    for (const v of ["=1+1", "+cmd|' /C calc'!A0", "-2+3", "@SUM(A1)", "\t=1", "\r=1", '=HYPERLINK("http://x","clique")']) {
      expect(neutralizeFormula(v)).toBe(`'${v}`);
    }
  });
  it("texto comum e E.164 estrito ficam como estão", () => {
    for (const v of ["Ana", "a=b", "41 9999", "+5541999010287", ""]) expect(neutralizeFormula(v)).toBe(v);
    expect(neutralizeFormula("+55 41 9999")).toBe("'+55 41 9999"); // não é E.164 estrito
    expect(neutralizeFormula("+5541999010287=1")).toBe("'+5541999010287=1");
  });
  it("CSV: neutraliza e põe aspas; número não é texto", () => {
    expect(csvCell("=1;2")).toBe("\"'=1;2\"");
    expect(csvCell("\tx")).toBe("\"'\tx\"");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(null)).toBe("");
    expect(toCsv([["a", "=b"]])).toBe("﻿a;'=b\r\n");
  });
  it("XLSX: texto neutralizado, número mantido", () => {
    expect(xlsxCell("@x")).toBe("'@x");
    expect(xlsxCell(-3)).toBe(-3);
  });
  it("linhas recusadas e planilha-modelo passam pela defesa", () => {
    const csv = rejectedCsv(["nome"], [{ line: 2, reason: "Sem e-mail", cells: ["=cmd()"] }], { line: "Linha", reason: "Motivo" });
    expect(csv).toContain(";'=cmd()");
    expect(csv).not.toMatch(/;=cmd/);
    const tpl = templateCsv(messages.importer.fields);
    for (const line of tpl.replace("﻿", "").split("\r\n").filter(Boolean)) {
      for (const cell of line.split(";")) expect(cell).not.toMatch(/^[=+\-@\t\r]/);
    }
  });
});
