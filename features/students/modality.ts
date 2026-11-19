/** Modalidade do aluno (base do presencial): mesma lista do CHECK de `students.modality`. */
export const MODALITIES = ["consultoria", "presencial", "hibrido"] as const;
export type Modality = (typeof MODALITIES)[number];
export const DEFAULT_MODALITY: Modality = "consultoria";
