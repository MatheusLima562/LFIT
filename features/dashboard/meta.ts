import { timestampToISODate, todayISO } from "@/lib/dates";
import { daysBetween, plural } from "@/lib/format";

/** Dias civis (São Paulo) de hoje até a data do timestamp; negativo = no passado. */
export function civilDaysFromToday(ts: string, now = new Date()): number {
  return daysBetween(todayISO(now), timestampToISODate(ts));
}

/** "vence hoje" · "vence em 3 dias" · "venceu há 2 dias". */
export function dueMeta(ts: string, verb: { future: string; past: string } = { future: "vence", past: "venceu" }, now = new Date()) {
  const d = civilDaysFromToday(ts, now);
  if (d === 0) return `${verb.future} hoje`;
  if (d > 0) return `${verb.future} em ${plural(d, "dia")}`;
  return `${verb.past} há ${plural(-d, "dia")}`;
}

/** "hoje" · "há 1 dia" · "há 5 dias". */
export function sinceMeta(ts: string, now = new Date()) {
  const d = -civilDaysFromToday(ts, now);
  return d <= 0 ? "cadastrado hoje" : `cadastrado há ${plural(d, "dia")}`;
}

/** Início do dia civil de hoje em São Paulo (UTC−3, sem horário de verão desde 2019), em ISO. */
export function startOfTodaySP(now = new Date()) {
  return new Date(`${todayISO(now)}T00:00:00-03:00`).toISOString();
}
