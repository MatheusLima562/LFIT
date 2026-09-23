import { z } from "zod";
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

const setSchema = z
  .object({
    set_type: z.enum(SET_TYPES),
    reps: optionalText(20, v.reps),
    load_value: loadValue,
    load_unit: z.enum(LOAD_UNITS).nullable(),
    load_text: optionalText(40),
    rest_seconds: z.number({ error: v.rest }).int(v.rest).min(0, v.rest).max(900, v.rest).nullable(),
  })
  .refine((s) => (s.load_value === null) === (s.load_unit === null), { message: v.load, path: ["load_value"] });

const itemSchema = z
  .object({
    exercise_id: z.uuid(),
    group_key: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,20}$/)
      .nullable(),
    sets: z.number({ error: v.sets }).int(v.sets).min(1, v.sets).max(20, v.sets).nullable(),
    reps: optionalText(20, v.reps),
    load_value: loadValue,
    load_unit: z.enum(LOAD_UNITS).nullable(),
    load_text: optionalText(40),
    rest_seconds: z.number({ error: v.rest }).int(v.rest).min(0, v.rest).max(900, v.rest).nullable(),
    tempo: z
      .string()
      .regex(/^[0-9Xx]{4}$/, v.tempo)
      .nullable(),
    rpe_target: z.number({ error: v.rpe }).min(1, v.rpe).max(10, v.rpe).nullable(),
    notes: optionalText(300),
    sets_detail: z.array(setSchema).max(MAX_SETS),
  })
  .refine((i) => (i.load_value === null) === (i.load_unit === null), { message: v.load, path: ["load_value"] });

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
    notes: optionalText(2000),
    workouts: z.array(workoutSchema).max(MAX_WORKOUTS, messages.plans.workouts.max),
  })
  .superRefine((p, ctx) => {
    if (p.starts_on && p.ends_on && p.ends_on < p.starts_on) {
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
