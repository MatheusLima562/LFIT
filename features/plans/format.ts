import { formatDate } from "@/lib/format";
import { todayISO } from "@/lib/dates";
import { messages } from "@/messages/pt-BR";

const t = messages.plans.manage;

export function planPeriod(startsOn: string | null, endsOn: string | null, noEnd = false) {
  if (noEnd) return t.periodNoEnd(startsOn ? formatDate(startsOn) : "…");
  if (!startsOn && !endsOn) return t.noPeriod;
  return t.period(startsOn ? formatDate(startsOn) : "…", endsOn ? formatDate(endsOn) : "…");
}

/** Dias (civis, SP) até o fim do plano; negativo = vencido. */
export function daysUntil(endsOn: string, today = todayISO()) {
  return Math.round((Date.parse(`${endsOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export type PlanSituation = { kind: "expired" | "soon" | "ok"; label: string };

export function planSituation(endsOn: string | null, today = todayISO()): PlanSituation | null {
  if (!endsOn) return null;
  const d = daysUntil(endsOn, today);
  if (d < 0) return { kind: "expired", label: t.expired };
  return { kind: d < 7 ? "soon" : "ok", label: t.daysLeft(d) };
}

const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/** 45 → "45 s" · 90 → "1 min 30 s" · 120 → "2 min". */
export function formatRest(seconds: number | null) {
  if (seconds === null) return null;
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}

/** Carga numérica + unidade e/ou texto livre: "40 kg", "moderada", "40 kg · moderada". */
export function formatLoad(value: number | null, unit: string | null, text: string | null) {
  const parts = [value !== null && unit ? `${num.format(value)} ${unit}` : null, text?.trim() || null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export const formatDecimal = (value: number | null) => (value === null ? null : num.format(value));
