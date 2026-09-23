import { z } from "zod";

/** Estado da tela "Meus alunos", persistido na URL (?status=inactive&sort=expires:desc...). */
export const STUDENT_TABS = ["active", "inactive", "expired"] as const;
export const STUDENT_SORTS = ["name:asc", "name:desc", "created:desc", "expires:asc", "expires:desc"] as const;
export const PAGE_SIZE = 25;

export type StudentTab = (typeof STUDENT_TABS)[number];
export type StudentSort = (typeof STUDENT_SORTS)[number];

const uuid = z.uuid().optional().catch(undefined);

export const studentListParamsSchema = z.object({
  status: z.enum(STUDENT_TABS).catch("active"),
  sort: z.enum(STUDENT_SORTS).catch("name:asc"),
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .catch(undefined)
    .transform((v) => v || undefined),
  turma: uuid,
  grupo: uuid,
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type StudentListParams = z.infer<typeof studentListParamsSchema>;

/** Aceita o objeto de searchParams do Next (valores podem vir como array). */
export function parseStudentListParams(raw: Record<string, string | string[] | undefined>): StudentListParams {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return studentListParamsSchema.parse({
    status: first(raw.status),
    sort: first(raw.sort),
    q: first(raw.q),
    turma: first(raw.turma),
    grupo: first(raw.grupo),
    page: first(raw.page),
  });
}

/** Monta a query string omitindo valores padrão (URLs curtas e estáveis). */
export function studentListHref(params: Partial<StudentListParams>, base = "/alunos") {
  const qs = new URLSearchParams();
  if (params.status && params.status !== "active") qs.set("status", params.status);
  if (params.sort && params.sort !== "name:asc") qs.set("sort", params.sort);
  if (params.q) qs.set("q", params.q);
  if (params.turma) qs.set("turma", params.turma);
  if (params.grupo) qs.set("grupo", params.grupo);
  if (params.page && params.page > 1) qs.set("page", String(params.page));
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}
