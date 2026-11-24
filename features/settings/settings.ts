import { toCsv } from "@/lib/spreadsheet";

/** Configurações do personal — lógica pura (caminhos de imagem, CSV da exportação). */
export const BRANDING_BUCKET = "org-branding";
export const BRANDING_MAX_DIM = 512;
export const BRANDING_MAX_BYTES = 2 * 1024 * 1024;

const ext = (mime: "image/webp" | "image/jpeg") => (mime === "image/webp" ? "webp" : "jpg");

/** `<org>/logo-<uuid>.webp` (owner) ou `<org>/avatar-<user>-<uuid>.webp` (cada um a própria foto). */
export function brandingPath(orgId: string, kind: "logo" | "avatar", fileId: string, mime: "image/webp" | "image/jpeg", userId?: string) {
  return kind === "logo" ? `${orgId}/logo-${fileId}.${ext(mime)}` : `${orgId}/avatar-${userId}-${fileId}.${ext(mime)}`;
}

/** Fusos aceitos para a conta (mesma lista de `private.allowed_time_zones()` no banco). */
export const TIME_ZONES = [
  "America/Sao_Paulo", "America/Bahia", "America/Fortaleza", "America/Recife", "America/Maceio", "America/Belem",
  "America/Araguaina", "America/Santarem", "America/Manaus", "America/Cuiaba", "America/Campo_Grande",
  "America/Porto_Velho", "America/Boa_Vista", "America/Rio_Branco", "America/Eirunepe", "America/Noronha",
  "Europe/Lisbon",
] as const;

export type ExportKind = "students" | "sessions";

const dateBR = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeBR = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const d = (v: unknown) => (typeof v === "string" && v ? (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join("/") : dateBR.format(new Date(v))) : "");
// "dd/mm/aaaa hh:mm" (sem a vírgula do Intl, que a planilha leria como separador decimal em algumas versões).
const dt = (v: unknown) => (typeof v === "string" && v ? dateTimeBR.format(new Date(v)).replace(", ", " ") : "");
const s = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "number" ? v : String(v));

const STUDENT_HEADERS = ["Matrícula", "Nome", "Sobrenome", "E-mail", "WhatsApp", "Nascimento", "Modalidade", "Situação", "Professor", "Cadastro", "Acesso até"];
const STUDENT_HEALTH = ["Grupos especiais (saúde)", "Observações"];
const SESSION_HEADERS = ["Aluno", "Matrícula", "Início", "Fim", "Situação", "Divisão", "Exercícios concluídos", "Séries registradas", "Esforço (RPE)", "Nota do treino"];
const SESSION_HEALTH = ["Dor relatada no início", "Maior dor (0–10)", "Comentário do aluno"];

/**
 * CSV da exportação (`;` + BOM, neutralizado contra fórmula em `lib/spreadsheet.ts`). As colunas de saúde só existem com
 * `includeHealth` — sem ele, nem o cabeçalho aparece (o banco também não devolve os valores).
 */
export function exportToCsv(kind: ExportKind, rows: Record<string, unknown>[], includeHealth: boolean): string {
  if (kind === "students") {
    const header = includeHealth ? [...STUDENT_HEADERS, ...STUDENT_HEALTH] : STUDENT_HEADERS;
    return toCsv([
      header,
      ...rows.map((r) => {
        const base = [s(r.enrollment_number), s(r.first_name), s(r.last_name), s(r.email), s(r.whatsapp), d(r.birth_date), s(r.modality), s(r.status), s(r.trainer), d(r.created_at), d(r.access_expires_at)];
        return includeHealth ? [...base, s(r.groups), s(r.notes)] : base;
      }),
    ]);
  }
  const header = includeHealth ? [...SESSION_HEADERS, ...SESSION_HEALTH] : SESSION_HEADERS;
  return toCsv([
    header,
    ...rows.map((r) => {
      const base = [s(r.student), s(r.enrollment_number), dt(r.started_at), dt(r.finished_at), s(r.status), s(r.workout_label), s(r.exercises_done), s(r.sets_logged), s(r.rpe), s(r.rating)];
      return includeHealth ? [...base, s(r.pain_checkin), s(r.max_pain), s(r.feedback_note)] : base;
    }),
  ]);
}
