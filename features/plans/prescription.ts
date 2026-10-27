/**
 * "Prescrição" comum ao resumo do item e a cada série detalhada: unidade + quantidade
 * (mín–máx), intensidade (texto curto: "RPE 8", "70%"), velocidade (preset) OU cadência, pausa mín–máx.
 * Mesmas regras dos CHECKs do banco (20261004120200_prescription.sql).
 */
import { messages } from "@/messages/pt-BR";

export const QUANTITY_UNITS = ["reps", "failure", "seconds", "minutes", "meters", "km", "arrivals", "ascents", "descents"] as const;
export const SPEED_PRESETS = ["slow", "moderate", "fast", "explosive"] as const;

export type QuantityUnit = (typeof QUANTITY_UNITS)[number];
export type SpeedPreset = (typeof SPEED_PRESETS)[number];

/** Unidades contadas em inteiros. */
export const INTEGER_UNITS: readonly QuantityUnit[] = ["reps", "arrivals", "ascents", "descents"];

const p = messages.plans.prescription;
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

export function formatQuantity(unit: QuantityUnit, min: number | null, max: number | null, note: string | null) {
  if (unit === "failure") return [p.units.failure, note].filter(Boolean).join(" ");
  if (min === null) return note || null;
  const range = max !== null && max !== min ? `${num.format(min)}–${num.format(max)}` : num.format(min);
  return [`${range} ${p.suffix[unit]}`, note].filter(Boolean).join(" ");
}

export function formatSpeed(speed: SpeedPreset | null, tempo: string | null) {
  if (speed) return p.speeds[speed];
  return tempo ? `${p.tempoShort} ${tempo}` : null;
}

/** 60 → "60 s" · 60–90 → "60–90 s" · 120 → "2 min". */
/** Pausa: até 90 s em segundos ("60 s", "90 s"); acima disso em minutos ("2 min", "2 min 30 s"). Mesma regra em tudo. */
export function formatRestSeconds(seconds: number) {
  if (seconds <= 90) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  const r = seconds % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

/** Faixa de pausa com a mesma regra: "60–90 s", "2–3 min", "90 s – 2 min". */
export function formatRestRange(min: number | null, max: number | null) {
  if (min === null) return null;
  if (max === null || max === min) return formatRestSeconds(min);
  if (max <= 90) return `${min}–${max} s`;
  if (min > 90 && min % 60 === 0 && max % 60 === 0) return `${min / 60}–${max / 60} min`;
  return `${formatRestSeconds(min)} – ${formatRestSeconds(max)}`;
}
