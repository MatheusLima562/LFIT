/**
 * XLSX no navegador: o ExcelJS (já dependência da exportação) só é baixado quando a pessoa escolhe um .xlsx.
 * Lê a primeira planilha; datas viram aaaa-mm-dd; fórmulas, links e texto rico viram o texto exibido.
 */
import type { CellValue } from "exceljs";

function cellText(v: CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    // O Excel guarda datas civis como meia-noite UTC.
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v) return cellText(v.result as CellValue);
    if ("error" in v) return "";
    return "";
  }
  return String(v);
}

export async function readXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  // Índice = número da linha no Excel − 1 (linhas vazias ficam vazias, para o relatório citar a linha certa).
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= row.cellCount; c++) cells.push(cellText(row.getCell(c).value).trim());
    while (rows.length < row.number - 1) rows.push([]);
    rows.push(cells);
  });
  return rows;
}
