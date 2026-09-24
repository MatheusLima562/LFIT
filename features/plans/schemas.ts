import { z } from "zod";
import { sanitizeTip } from "@/lib/rich-tip";
import { INTEGER_UNITS, INTENSITY_RANGE, INTENSITY_TYPES, QUANTITY_UNITS, SPEED_PRESETS } from "./prescription";
import { messages } from "@/messages/pt-BR";

const v = messages.plans.validation;

export const PLAN_LEVELS = ["iniciante", "intermediario", "avancado"] as const;
export const SET_TYPES = ["warmup", "work", "drop"] as const;
export const LOAD_UNITS = ["kg", "lb"] as const;
export const MAX_WORKOUTS = 12;
export const MAX_ITEMS = 40;
export const MAX_SETS = 20;

export type PlanLevel = (typeof PLAN_LEVELS)[number];
export type SetType = (typeof SET_TYPES)[number];
export type LoadUnit = (typeof LOAD_UNITS)[number];

const optionalText = (max: number, message?: string) => z.string().trim().max(max, message).nullable();
const loadValue = z.number({ error: v.load }).min(0, v.load).max(9999.99, v.load).nullable();
const isoDate = z.iso.date(v.date).nullable();

const restSeconds = z.number({ error: v.rest }).int(v.rest).min(0, v.rest).max(900, v.rest).nullable();
const quantity = z.number({ error: v.quantity }).min(0, v.quantity).max(99999, v.quantity).nullable();

/** Campos de prescrição (resumo do item e séries): mesmas regras dos CHECKs do banco. */
const prescriptionShape = {
  quantity_unit: z.enum(QUANTITY_UNITS),
  quantity_min: quantity,
  quantity_max: quantity,
  quantity_note: optionalText(40),
  intensity_type: z.enum(INTENSITY_TYPES).nullable(),
  intensity_value: z.number({ error: v.intensity }).nullable(),
  speed: z.enum(SPEED_PRESETS).nullable(),
  tempo: z
    .string()
    .regex(/^[0-9Xx]{4}$/, v.tempo)
    .nullable(),
  rest_min: restSeconds,
  rest_max: restSeconds,
};

type Prescription = { [K in keyof typeof prescriptionShape]: z.infer<(typeof prescriptionShape)[K]> };

function refinePrescription(p: Prescription, ctx: z.RefinementCtx) {
  const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (INTEGER_UNITS.includes(p.quantity_unit)) {
    if (p.quantity_min !== null && !Number.isInteger(p.quantity_min)) issue("quantity_min", v.quantityInteger);
    if (p.quantity_max !== null && !Number.isInteger(p.quantity_max)) issue("quantity_max", v.quantityInteger);
  }
  if (p.quantity_max !== null && (p.quantity_min === null || p.quantity_max < p.quantity_min)) issue("quantity_max", v.quantityRange);
  if (p.intensity_type) {
    const r = INTENSITY_RANGE[p.intensity_type];
    if (p.intensity_value === null) issue("intensity_value", v.intensity);
    else if (p.intensity_value < r.min || p.intensity_value > r.max) issue("intensity_value", v.intensityRange(r.min, r.max));
  }
  if (p.speed && p.tempo) issue("tempo", v.speedOrTempo);
  if (p.rest_max !== null && (p.rest_min === null || p.rest_max < p.rest_min)) issue("rest_max", v.restRange);
}

const setSchema = z
  .object({
    set_type: z.enum(SET_TYPES),
    ...prescriptionShape,
    load_value: loadValue,
    load_unit: z.enum(LOAD_UNITS).nullable(),
    load_text: optionalText(40),
  })
  .superRefine((s, ctx) => {
    refinePrescription(s, ctx);
    if ((s.load_value === null) !== (s.load_unit === null)) ctx.addIssue({ code: "custom", path: ["load_value"], message: v.load });
  });

const itemSchema = z
  .object({
    exercise_id: z.uuid(),
    group_key: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,20}$/)
      .nullable(),
    sets: z.number({ error: v.sets }).int(v.sets).min(1, v.sets).max(20, v.sets).nullable(),
    ...prescriptionShape,
    load_value: loadValue,
    load_unit: z.enum(LOAD_UNITS).nullable(),
    load_text: optionalText(40),
    // Saneada aqui (vale no cliente e na server action): só **negrito** e "- " lista; sem HTML.
    tip: z
      .string()
      .nullable()
      .transform((t) => (t === null ? null : sanitizeTip(t) || null)),
    substitutes: z.array(z.uuid()).max(3, v.substitutes),
    method_id: z.uuid().nullable(),
    objective_id: z.uuid().nullable(),
    sets_detail: z.array(setSchema).max(MAX_SETS),
  })
  .superRefine((i, ctx) => {
    refinePrescription(i, ctx);
    if ((i.load_value === null) !== (i.load_unit === null)) ctx.addIssue({ code: "custom", path: ["load_value"], message: v.load });
    if (i.substitutes.includes(i.exercise_id) || new Set(i.substitutes).size !== i.substitutes.length) {
      ctx.addIssue({ code: "custom", path: ["substitutes"], message: v.substitutes });
    }
  });

const workoutSchema = z.object({
  label: z.string().trim().min(1, v.label).max(10, v.label),
  name: optionalText(80),
  notes: optionalText(500),
  items: z.array(itemSchema).max(MAX_ITEMS, messages.plans.items.max),
});

/** Payload de public.save_training_plan (mesmas regras do banco). */
export const planPayloadSchema = z
  .object({
    id: z.uuid().nullable(),
    student_id: z.uuid().nullable(),
    name: z.string().trim().min(2, messages.validation.required).max(120),
    goal: optionalText(200),
    level: z.enum(PLAN_LEVELS).nullable(),
    starts_on: isoDate,
    ends_on: isoDate,
    no_end: z.boolean(),
    planned_sessions: z.number({ error: v.sessions }).int(v.sessions).min(1, v.sessions).max(500, v.sessions).nullable(),
    trainer_id: z.uuid().nullable(),
    notes: optionalText(2000),
    workouts: z.array(workoutSchema).max(MAX_WORKOUTS, messages.plans.workouts.max),
  })
  .superRefine((p, ctx) => {
    if (!p.no_end && p.starts_on && p.ends_on && p.ends_on < p.starts_on) {
      ctx.addIssue({ code: "custom", path: ["ends_on"], message: v.endBeforeStart });
    }
    p.workouts.forEach((w, wi) => {
      const seen = new Set<string>();
      let prev: string | null = null;
      w.items.forEach((it, ii) => {
        const g = it.group_key;
        if (g && g !== prev && seen.has(g)) {
          ctx.addIssue({ code: "custom", path: ["workouts", wi, "items", ii, "group_key"], message: messages.dbErrors.INVALID_GROUP_ORDER });
        }
        if (g) seen.add(g);
        prev = g;
      });
    });
  });

export type PlanPayload = z.infer<typeof planPayloadSchema>;
