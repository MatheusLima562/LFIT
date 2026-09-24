/**
 * "Prescrição" comum ao resumo do item e a cada série detalhada: unidade + quantidade
 * (mín–máx), intensidade (%1RM/RPE/RIR), velocidade (preset) OU cadência, pausa mín–máx.
 * Mesmas regras dos CHECKs do banco (20261004120200_prescription.sql).
 */
import { messages } from "@/messages/pt-BR";

export const QUANTITY_UNITS = ["reps", "failure", "seconds", "minutes", "meters", "km", "arrivals"] as const;
export const INTENSITY_TYPES = ["pct_1rm", "rpe", "rir"] as const;
export const SPEED_PRESETS = ["slow", "moderate", "fast", "explosive"] as const;

export type QuantityUnit = (typeof QUANTITY_UNITS)[number];
export type IntensityType = (typeof INTENSITY_TYPES)[number];
export type SpeedPreset = (typeof SPEED_PRESETS)[number];

/** Unidades contadas em inteiros. */
export const INTEGER_UNITS: readonly QuantityUnit[] = ["reps", "arrivals"];

export const INTENSITY_RANGE: Record<IntensityType, { min: number; max: number; step: number }> = {
  pct_1rm: { min: 1, max: 120, step: 1 },
  rpe: { min: 1, max: 10, step: 0.5 },
  rir: { min: 0, max: 10, step: 1 },
};

const p = messages.plans.prescription;
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

export function formatQuantity(unit: QuantityUnit, min: number | null, max: number | null, note: string | null) {
  if (unit === "failure") return [p.units.failure, note].filter(Boolean).join(" ");
  if (min === null) return note || null;
  const range = max !== null && max !== min ? `${num.format(min)}–${num.format(max)}` : num.format(min);
  return [`${range} ${p.suffix[unit]}`, note].filter(Boolean).join(" ");
}

export function formatIntensity(type: IntensityType | null, value: number | null) {
  if (!type || value === null) return null;
  return p.intensityFormat[type](num.format(value));
}

export function formatSpeed(speed: SpeedPreset | null, tempo: string | null) {
  if (speed) return p.speeds[speed];
  return tempo ? `${p.tempoShort} ${tempo}` : null;
}

/** 60 → "60 s" · 60–90 → "60–90 s" · 120 → "2 min". */
export function formatRestRange(min: number | null, max: number | null) {
  if (min === null) return null;
  const fmt = (s: number) => (s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${s} s`);
  if (max === null || max === min) return fmt(min);
  return min % 60 === 0 && max % 60 === 0 && min >= 60 ? `${min / 60}–${max / 60} min` : `${min}–${max} s`;
}
