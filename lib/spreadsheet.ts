/**
 * Defesa contra injeção de fórmula em TODA planilha que o sistema gera (CSV e XLSX): texto que começa com `=`, `+`,
 * `-`, `@`, tab ou CR ganha um apóstrofo na frente, e o Excel/Sheets o tratam como texto. Exceção única: telefone E.164
 * estrito (`+` seguido só de dígitos, validado pelo banco), que não carrega fórmula e ficaria feio com o apóstrofo.
 * Números (tipo number) não passam por aqui: são dado, não texto. Testado em tests/unit/spreadsheet.test.ts.
 */
const FORMULA_START = /^[=+\-@\t\r]/;
const E164 = /^\+[1-9]\d{7,14}$/;

export function neutralizeFormula(value: string): string {
  return FORMULA_START.test(value) && !E164.test(value) ? `'${value}` : value;
}

/** Célula de CSV com ";" (padrão do Excel em pt-BR): neutraliza fórmula e põe aspas quando precisa. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "number" ? String(value) : neutralizeFormula(value);
  return /[";\n\r\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Linhas → CSV com BOM UTF-8 e CRLF (abre direto no Excel). */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return `﻿${rows.map((r) => r.map(csvCell).join(";")).join("\r\n")}\r\n`;
}

/** Valor para célula de XLSX: texto neutralizado; número e vazio como estão. */
export function xlsxCell(value: string | number | null | undefined): string | number {
  if (value === null || value === undefined) return "";
  return typeof value === "number" ? value : neutralizeFormula(value);
}
