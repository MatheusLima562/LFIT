import { z } from "zod";
import { MUSCLE_GROUPS } from "./constants";

/** Estado da biblioteca de exercícios na URL (?q=&grupo=&equip=&origem=&condicao=&page=). */
export const EXERCISE_ORIGINS = ["all", "global", "own", "archived"] as const;
export type ExerciseOrigin = (typeof EXERCISE_ORIGINS)[number];
export const EXERCISE_PAGE_SIZE = 30;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .catch(undefined)
    .transform((v) => v || undefined);

export const exerciseListParamsSchema = z.object({
  q: text(100),
  grupo: z.enum(MUSCLE_GROUPS).optional().catch(undefined),
  equip: text(80),
  origem: z.enum(EXERCISE_ORIGINS).catch("all"),
  condicao: z.uuid().optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type ExerciseListParams = z.infer<typeof exerciseListParamsSchema>;

export function parseExerciseListParams(raw: Record<string, string | string[] | undefined>): ExerciseListParams {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return exerciseListParamsSchema.parse({
    q: first(raw.q),
    grupo: first(raw.grupo),
    equip: first(raw.equip),
    origem: first(raw.origem),
    condicao: first(raw.condicao),
    page: first(raw.page),
  });
}

export function exerciseListHref(params: Partial<ExerciseListParams>, extra: Record<string, string> = {}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.grupo) qs.set("grupo", params.grupo);
  if (params.equip) qs.set("equip", params.equip);
  if (params.origem && params.origem !== "all") qs.set("origem", params.origem);
  if (params.condicao) qs.set("condicao", params.condicao);
  if (params.page && params.page > 1) qs.set("page", String(params.page));
  for (const [k, v] of Object.entries(extra)) qs.set(k, v);
  const s = qs.toString();
  return s ? `/treinos/exercicios?${s}` : "/treinos/exercicios";
}
