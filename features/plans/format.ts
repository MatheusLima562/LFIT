import { formatDate } from "@/lib/format";
import { todayISO } from "@/lib/dates";
import { messages } from "@/messages/pt-BR";

const t = messages.plans.manage;

export function planPeriod(startsOn: string | null, endsOn: string | null) {
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
