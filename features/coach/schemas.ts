import { z } from "zod";

/** Recado do professor e resposta ao feedback: até 300 caracteres (mesmo limite dos CHECKs do banco). */
export const COACH_TEXT_MAX = 300;
export const coachTextSchema = z.string().trim().min(1).max(COACH_TEXT_MAX);
