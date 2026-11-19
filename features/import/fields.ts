/**
 * Campos da importação e sugestão automática de colunas por sinônimos (pt-BR/en). Lógica pura.
 * "Modelos por plataforma" (`PLATFORM_PRESETS`): cabeçalhos exatos de exportações conhecidas (MFIT etc.), conferidos
 * com um arquivo real antes de entrar. Hoje só o genérico (detecção por sinônimos).
 */
import { searchKey } from "@/lib/text";

export const IMPORT_FIELDS = [
  "name",
  "last_name",
  "email",
  "phone",
  "birth_date",
  "goal",
  "notes",
  "start_date",
  "modality",
  "status",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const REQUIRED_FIELDS: readonly ImportField[] = ["name", "email"];

/** Coluna escolhida para cada campo (índice no cabeçalho) ou null = não importar. */
export type ColumnMapping = Record<ImportField, number | null>;

const SYNONYMS: Record<ImportField, string[]> = {
  name: ["nome", "nome completo", "nome do aluno", "aluno", "cliente", "nome do cliente", "primeiro nome", "name", "full name", "fullname", "first name", "student", "client"],
  last_name: ["sobrenome", "ultimo nome", "last name", "surname", "family name"],
  email: ["email", "e-mail", "e mail", "mail", "endereco de email", "email address"],
  phone: ["telefone", "celular", "whatsapp", "whats", "fone", "tel", "telefone celular", "numero", "contato", "phone", "mobile", "cell", "cellphone", "phone number"],
  birth_date: ["nascimento", "data de nascimento", "data nascimento", "dt nascimento", "dt nasc", "aniversario", "birth date", "birthdate", "birthday", "date of birth", "dob"],
  goal: ["objetivo", "objetivos", "meta", "metas", "goal", "goals", "objective"],
  notes: ["observacoes", "observacao", "obs", "anotacoes", "notas", "comentarios", "notes", "note", "comments", "remarks"],
  start_date: ["data de inicio", "data inicio", "inicio", "dt inicio", "data de matricula", "data matricula", "data de cadastro", "cadastro", "cliente desde", "aluno desde", "start date", "start", "since", "member since", "created at", "signup date"],
  modality: ["modalidade", "tipo de atendimento", "atendimento", "tipo", "modality", "service type", "type"],
  status: ["status", "situacao", "ativo", "state", "active"],
};

const norm = (s: string) => searchKey(s).replace(/[^a-z0-9]+/g, " ").trim();

const NORMALIZED: Record<ImportField, string[]> = Object.fromEntries(
  IMPORT_FIELDS.map((f) => [f, SYNONYMS[f].map(norm)]),
) as Record<ImportField, string[]>;

export interface PlatformPreset {
  id: string;
  /** Cabeçalho exato (normalizado) → campo. Vazio = só sinônimos. */
  headers: Record<string, ImportField>;
}

export const PLATFORM_PRESETS: readonly PlatformPreset[] = [{ id: "generic", headers: {} }];

export function emptyMapping(): ColumnMapping {
  return Object.fromEntries(IMPORT_FIELDS.map((f) => [f, null])) as ColumnMapping;
}

/**
 * Sugestão: (1) cabeçalho exato do modelo da plataforma; (2) igual a um sinônimo; (3) contém o sinônimo como palavras
 * inteiras (só sinônimos de 4+ letras, para "tel" não casar com "hotel"). Cada coluna serve a um campo só; na dúvida,
 * fica sem mapear (a pessoa escolhe).
 */
export function suggestMapping(headers: string[], preset: PlatformPreset = PLATFORM_PRESETS[0]): ColumnMapping {
  const mapping = emptyMapping();
  const used = new Set<number>();
  const keys = headers.map(norm);
  const assign = (field: ImportField, idx: number) => {
    if (mapping[field] === null && !used.has(idx)) {
      mapping[field] = idx;
      used.add(idx);
    }
  };

  keys.forEach((k, i) => {
    const field = preset.headers[k];
    if (field) assign(field, i);
  });
  for (const field of IMPORT_FIELDS) {
    const i = keys.findIndex((k, idx) => !used.has(idx) && NORMALIZED[field].includes(k));
    if (i !== -1) assign(field, i);
  }
  for (const field of IMPORT_FIELDS) {
    if (mapping[field] !== null) continue;
    const i = keys.findIndex(
      (k, idx) => !used.has(idx) && NORMALIZED[field].some((syn) => syn.length >= 4 && ` ${k} `.includes(` ${syn} `)),
    );
    if (i !== -1) assign(field, i);
  }
  return mapping;
}

export function missingRequired(mapping: ColumnMapping): ImportField[] {
  return REQUIRED_FIELDS.filter((f) => mapping[f] === null);
}
