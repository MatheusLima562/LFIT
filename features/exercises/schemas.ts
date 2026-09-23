import { z } from "zod";
import { messages } from "@/messages/pt-BR";
import { isSupportedVideoUrl } from "@/lib/video";
import { CONTRAINDICATION_LEVELS, MUSCLE_GROUPS } from "./constants";

const t = messages.exercises;

export const contraindicationRuleSchema = z.object({
  conditionId: z.uuid(t.rules.conditionRequired),
  level: z.enum(CONTRAINDICATION_LEVELS),
  note: z.string().trim().max(300),
});

export const exerciseFormSchema = z
  .object({
    name: z.string().trim().min(2, messages.validation.required).max(120),
    muscleGroups: z.array(z.enum(MUSCLE_GROUPS)).min(1, t.form.musclesRequired).max(MUSCLE_GROUPS.length),
    equipment: z.string().trim().max(80),
    instructions: z.string().trim().max(2000),
    videoUrl: z
      .string()
      .trim()
      .max(300)
      .refine((v) => v === "" || isSupportedVideoUrl(v), t.form.invalidVideo),
    rules: z.array(contraindicationRuleSchema).max(30),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.rules.forEach((r, i) => {
      if (seen.has(r.conditionId)) ctx.addIssue({ code: "custom", path: ["rules", i, "conditionId"], message: t.rules.duplicate });
      seen.add(r.conditionId);
    });
  });

export type ExerciseFormInput = z.infer<typeof exerciseFormSchema>;

export const emptyExerciseForm: ExerciseFormInput = {
  name: "",
  muscleGroups: [],
  equipment: "",
  instructions: "",
  videoUrl: "",
  rules: [],
};
