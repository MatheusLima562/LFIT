import { z } from "zod";
import { messages } from "@/messages/pt-BR";
import { INTEGER_UNITS, QUANTITY_UNITS, type QuantityUnit } from "@/features/plans/prescription";

/** Valores padrão de um exercício ("+ Rápido" no montador). Camadas: equipe → LFit → 3 × 10–12, 60 s. */
export interface ExerciseDefaults {
  sets: number | null;
  quantityUnit: QuantityUnit;
  quantityMin: number | null;
  quantityMax: number | null;
  restMin: number | null;
  restMax: number | null;
}

export const FALLBACK_DEFAULTS: ExerciseDefaults = { sets: 3, quantityUnit: "reps", quantityMin: 10, quantityMax: 12, restMin: 60, restMax: null };

const v = messages.plans.validation;
const num = z.number({ error: v.quantity }).min(0, v.quantity).max(99999, v.quantity).nullable();
const rest = z.number({ error: v.rest }).int(v.rest).min(0, v.rest).max(900, v.rest).nullable();

export const exerciseDefaultsSchema = z
  .object({
    sets: z.number({ error: v.sets }).int(v.sets).min(1, v.sets).max(20, v.sets).nullable(),
    quantityUnit: z.enum(QUANTITY_UNITS),
    quantityMin: num,
    quantityMax: num,
    restMin: rest,
    restMax: rest,
  })
  .superRefine((d, ctx) => {
    if (INTEGER_UNITS.includes(d.quantityUnit) && [d.quantityMin, d.quantityMax].some((n) => n !== null && !Number.isInteger(n))) {
      ctx.addIssue({ code: "custom", path: ["quantityMin"], message: v.quantityInteger });
    }
    if (d.quantityMax !== null && (d.quantityMin === null || d.quantityMax < d.quantityMin)) ctx.addIssue({ code: "custom", path: ["quantityMax"], message: v.quantityRange });
    if (d.restMax !== null && (d.restMin === null || d.restMax < d.restMin)) ctx.addIssue({ code: "custom", path: ["restMax"], message: v.restRange });
  })
  .transform((d) => (d.quantityUnit === "failure" ? { ...d, quantityMin: null, quantityMax: null } : d));

export type DefaultsRow = {
  organization_id: string | null;
  exercise_id: string;
  sets: number | null;
  quantity_unit: QuantityUnit;
  quantity_min: number | null;
  quantity_max: number | null;
  rest_min: number | null;
  rest_max: number | null;
};

export const toDefaults = (r: DefaultsRow): ExerciseDefaults => ({
  sets: r.sets,
  quantityUnit: r.quantity_unit,
  quantityMin: r.quantity_min,
  quantityMax: r.quantity_max,
  restMin: r.rest_min,
  restMax: r.rest_max,
});

/** Camada da equipe prevalece sobre a global. */
export function resolveDefaults(rows: DefaultsRow[], exerciseId: string): ExerciseDefaults {
  const mine = rows.filter((r) => r.exercise_id === exerciseId);
  const row = mine.find((r) => r.organization_id !== null) ?? mine.find((r) => r.organization_id === null);
  return row ? toDefaults(row) : FALLBACK_DEFAULTS;
}
