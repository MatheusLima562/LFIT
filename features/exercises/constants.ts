/** Mesma lista de private.valid_muscle_groups (rótulos em messages.muscleGroups). */
export const MUSCLE_GROUPS = [
  "peitoral",
  "dorsais",
  "trapezio",
  "ombros",
  "biceps",
  "triceps",
  "antebracos",
  "abdomen",
  "lombar",
  "gluteos",
  "quadriceps",
  "posteriores",
  "panturrilhas",
  "adutores",
  "abdutores",
  "corpo_inteiro",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const CONTRAINDICATION_LEVELS = ["avoid", "caution"] as const;
export type ContraindicationLevel = (typeof CONTRAINDICATION_LEVELS)[number];
