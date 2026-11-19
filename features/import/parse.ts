/**
 * Leitura do arquivo de importação NO CLIENTE (o original nunca é enviado nem guardado). Lógica pura, testada em
 * tests/unit/import.test.ts. XLSX fica em `xlsx.ts` (carrega o ExcelJS só quando preciso).
 */

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 2000;

export type Encoding = "utf-8" | "windows-1252";

/** UTF-8 (com ou sem BOM) se for válido; senão Windows-1252 (o padrão do Excel no Windows em pt-BR). */
export function decodeText(bytes: Uint8Array): { text: string; encoding: Encoding } {
  const body = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(body), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(body), encoding: "windows-1252" };
  }
}

/** Separador mais frequente fora de aspas na primeira linha com conteúdo (";" é o padrão do Excel em pt-BR). */
export function detectDelimiter(text: string): ";" | "," | "\t" {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const counts = { ";": 0, ",": 0, "\t": 0 };
  let quoted = false;
  for (const ch of firstLine) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch as keyof typeof counts]++;
  }
  const best = (Object.entries(counts) as [";" | "," | "\t", number][]).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ";";
}

/**
 * CSV (RFC 4180: aspas, aspas duplicadas, quebra de linha dentro de aspas, CRLF). Linhas vazias ficam (vazias), para o
 * número da linha no relatório bater com o arquivo; `toSheet` as descarta.
 */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const isBlank = (r: string[]) => r.every((c) => c.trim() === "");

export interface Sheet {
  headers: string[];
  /** Linhas de dados (sem o cabeçalho), cada uma com o número da linha no arquivo (cabeçalho = 1). */
  rows: { line: number; cells: string[] }[];
}

/** Primeira linha com conteúdo = cabeçalho. Cabeçalho vazio vira "Coluna N". `line` = linha no arquivo (1 = primeira). */
export function toSheet(table: string[][]): Sheet {
  const headIndex = table.findIndex((r) => !isBlank(r));
  if (headIndex === -1) return { headers: [], rows: [] };
  const head = table[headIndex];
  const data = table
    .map((cells, i) => ({ line: i + 1, cells }))
    .slice(headIndex + 1)
    .filter((r) => !isBlank(r.cells));
  const width = Math.max(head.length, ...data.map((r) => r.cells.length));
  const headers = Array.from({ length: width }, (_, i) => (head[i] ?? "").trim() || `Coluna ${i + 1}`);
  return {
    headers,
    rows: data.map((r) => ({ line: r.line, cells: Array.from({ length: width }, (_, j) => (r.cells[j] ?? "").trim()) })),
  };
}

export type FileProblem = "too_big" | "too_many_rows" | "empty" | "unsupported";

export function fileKind(name: string): "csv" | "xlsx" | null {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "csv" || ext === "txt") return "csv";
  if (ext === "xlsx") return "xlsx";
  return null;
}

export function checkSheet(sheet: Sheet): FileProblem | null {
  if (sheet.rows.length === 0) return "empty";
  if (sheet.rows.length > MAX_ROWS) return "too_many_rows";
  return null;
}
