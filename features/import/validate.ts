/**
 * Validação de cada linha antes do envio (as mesmas regras do banco, para o relatório sair antes de gravar).
 * Erro = a linha não é importada. Aviso = a linha entra sem aquele dado (ex.: telefone inválido), e o relatório diz.
 * Nunca registra valores em console; o relatório cita linha + motivo.
 */
import { toE164 } from "@/lib/phone";
import { parseBRDate, isoToBR, todayISO } from "@/lib/dates";
import { searchKey } from "@/lib/text";
import { toCsv } from "@/lib/spreadsheet";
import type { ColumnMapping, ImportField } from "./fields";

export type RowError =
  | "name_missing"
  | "last_name_missing"
  | "name_too_long"
  | "email_missing"
  | "email_invalid"
  | "email_duplicate_in_file"
  | "notes_too_long"
  | "cell_too_long";

/** Limite por célula (o banco repete): e-mail 254, objetivo/observações 2000, o resto 120. */
export const CELL_LIMITS: Record<ImportField, number> = {
  name: 120,
  last_name: 120,
  email: 254,
  phone: 120,
  birth_date: 120,
  goal: 2000,
  notes: 2000,
  start_date: 120,
  modality: 120,
  status: 120,
};

export type RowWarning = "phone_invalid" | "birth_date_invalid" | "start_date_invalid" | "modality_unknown" | "status_unknown";

export type Modality = "consultoria" | "presencial" | "hibrido";
export type ImportStatus = "active" | "inactive";

export interface StudentPayload {
  row: number;
  first_name: string;
  last_name: string;
  email: string;
  whatsapp_e164: string | null;
  birth_date: string | null;
  notes: string | null;
  modality: Modality;
  status: ImportStatus;
}

export interface ValidatedRow {
  line: number;
  payload: StudentPayload | null;
  errors: RowError[];
  warnings: RowWarning[];
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const NOTES_MAX = 2000;

const key = (s: string) => searchKey(s).replace(/[^a-z0-9]+/g, " ").trim();

const MODALITY: Record<string, Modality> = {
  consultoria: "consultoria",
  "consultoria online": "consultoria",
  online: "consultoria",
  remoto: "consultoria",
  "a distancia": "consultoria",
  distancia: "consultoria",
  presencial: "presencial",
  "personal presencial": "presencial",
  "in person": "presencial",
  hibrido: "hibrido",
  misto: "hibrido",
  hybrid: "hibrido",
};

const STATUS: Record<string, ImportStatus> = {
  ativo: "active",
  ativa: "active",
  active: "active",
  sim: "active",
  s: "active",
  a: "active",
  "1": "active",
  yes: "active",
  inativo: "inactive",
  inativa: "inactive",
  inactive: "inactive",
  cancelado: "inactive",
  cancelada: "inactive",
  encerrado: "inactive",
  pausado: "inactive",
  trancado: "inactive",
  nao: "inactive",
  n: "inactive",
  i: "inactive",
  "0": "inactive",
  no: "inactive",
};

/** "31/12/1990", "31-12-1990", "31.12.1990", "1990-12-31" (inclusive vindo do Excel) → ISO; ano com 2 dígitos não. */
export function parseFlexibleDate(raw: string): string | null {
  const v = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(v);
  if (m) return parseBRDate(`${m[3].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[1]}`);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  if (m) return parseBRDate(`${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}`);
  return null;
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

export function validateRow(
  line: number,
  cells: string[],
  mapping: ColumnMapping,
  seenEmails: Set<string>,
  today = todayISO(),
): ValidatedRow {
  const get = (f: ImportField) => (mapping[f] === null ? "" : collapse(cells[mapping[f]!] ?? ""));
  const errors: RowError[] = [];
  const warnings: RowWarning[] = [];

  // Célula gigante (arquivo malformado ou malicioso) recusa a linha antes de qualquer outra regra.
  const tooLong = (Object.keys(CELL_LIMITS) as ImportField[]).some((f) => get(f).length > CELL_LIMITS[f]);
  if (tooLong) return { line, errors: ["cell_too_long"], warnings: [], payload: null };

  // Nome: com coluna de sobrenome, "nome" é o primeiro nome; sem ela, primeira palavra + resto.
  const name = get("name");
  let first = name;
  let last = get("last_name");
  if (mapping.last_name === null) {
    const [head, ...rest] = name.split(" ");
    first = head ?? "";
    last = rest.join(" ");
  }
  if (!first) errors.push("name_missing");
  else if (!last) errors.push("last_name_missing");
  if (first.length > 80 || last.length > 120) errors.push("name_too_long");

  const email = get("email").toLowerCase();
  if (!email) errors.push("email_missing");
  else if (!EMAIL.test(email)) errors.push("email_invalid");
  else if (seenEmails.has(email)) errors.push("email_duplicate_in_file");
  else seenEmails.add(email);

  const phoneRaw = get("phone");
  let phone: string | null = null;
  if (phoneRaw) {
    phone = toE164(phoneRaw, "BR");
    if (!phone) warnings.push("phone_invalid");
  }

  const birthRaw = get("birth_date");
  let birth: string | null = null;
  if (birthRaw) {
    birth = parseFlexibleDate(birthRaw);
    if (!birth || birth <= "1900-01-01" || birth > today) {
      birth = null;
      warnings.push("birth_date_invalid");
    }
  }

  // Objetivo e data de início não têm coluna própria no cadastro: entram nas observações, rotulados.
  const notesParts = [get("notes")];
  const goal = get("goal");
  if (goal) notesParts.push(`Objetivo: ${goal}`);
  const startRaw = get("start_date");
  if (startRaw) {
    const start = parseFlexibleDate(startRaw);
    if (start && start <= today) notesParts.push(`Início (importado): ${isoToBR(start)}`);
    else warnings.push("start_date_invalid");
  }
  const notes = notesParts.filter(Boolean).join("\n");
  if (notes.length > NOTES_MAX) errors.push("notes_too_long");

  const modalityRaw = get("modality");
  let modality: Modality = "consultoria";
  if (modalityRaw) {
    const m = MODALITY[key(modalityRaw)];
    if (m) modality = m;
    else warnings.push("modality_unknown");
  }

  const statusRaw = get("status");
  let status: ImportStatus = "active";
  if (statusRaw) {
    const s = STATUS[key(statusRaw)];
    if (s) status = s;
    else warnings.push("status_unknown");
  }

  return {
    line,
    errors,
    warnings,
    payload: errors.length
      ? null
      : { row: line, first_name: first, last_name: last, email, whatsapp_e164: phone, birth_date: birth, notes: notes || null, modality, status },
  };
}

export function validateAll(rows: { line: number; cells: string[] }[], mapping: ColumnMapping, today = todayISO()): ValidatedRow[] {
  const seen = new Set<string>();
  return rows.map((r) => validateRow(r.line, r.cells, mapping, seen, today));
}

export const BATCH_SIZE = 200;

export function batches<T>(items: T[], size = BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Erros do servidor por linha (códigos fixos da RPC `import_students`). */
export type ServerRowError = "DUPLICATE_EMAIL" | "PLAN_LIMIT_REACHED" | "INVALID_INPUT" | "INVALID_TRAINER" | "IMPORT_ROW_FAILED";

export interface ServerRowResult {
  row: number;
  ok: boolean;
  error?: ServerRowError;
}

const SERVER_ERRORS: readonly ServerRowError[] = ["DUPLICATE_EMAIL", "PLAN_LIMIT_REACHED", "INVALID_INPUT", "INVALID_TRAINER", "IMPORT_ROW_FAILED"];

/** Resposta de `import_students` → resultados por linha (formato inesperado = todas as linhas do lote com falha). */
export function parseImportResponse(raw: unknown, sentRows: number[]): ServerRowResult[] {
  const results = (raw as { results?: unknown })?.results;
  if (!Array.isArray(results)) return sentRows.map((row) => ({ row, ok: false, error: "IMPORT_ROW_FAILED" }));
  return results.map((r, i) => {
    const o = (r ?? {}) as { row?: unknown; ok?: unknown; error?: unknown };
    const row = typeof o.row === "number" ? o.row : sentRows[i];
    if (o.ok === true) return { row, ok: true };
    const error = SERVER_ERRORS.includes(o.error as ServerRowError) ? (o.error as ServerRowError) : "IMPORT_ROW_FAILED";
    return { row, ok: false, error };
  });
}

/** Planilha-modelo: CSV com ";" e BOM (abre direto no Excel em pt-BR). Exemplo fictício. */
export function templateCsv(headers: Record<ImportField, string>): string {
  const cols: ImportField[] = ["name", "email", "phone", "birth_date", "goal", "notes", "start_date", "modality", "status"];
  const example = ["Maria Exemplo da Silva", "maria.exemplo@example.com", "(41) 99999-0000", "31/12/1990", "Hipertrofia", "", "01/03/2026", "presencial", "ativo"];
  return toCsv([cols.map((c) => headers[c]), example]);
}

/** Linhas recusadas para baixar (dados do próprio arquivo, gerado no navegador; nada vai ao servidor). */
export function rejectedCsv(headers: string[], rows: { line: number; cells: string[]; reason: string }[], labels: { line: string; reason: string }): string {
  // As células vêm do arquivo de outra pessoa/plataforma: neutralizar fórmula aqui é o que mais importa.
  return toCsv([[labels.line, labels.reason, ...headers], ...rows.map((r) => [String(r.line), r.reason, ...r.cells])]);
}
