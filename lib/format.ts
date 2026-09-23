const LOCALE = "pt-BR";
const DAY_MS = 86_400_000;

const currency = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "BRL" });
const decimal = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat(LOCALE);
const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
const time = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** Recebe centavos. */
export const formatCurrency = (cents: number) => currency.format(cents / 100);
export const formatDecimal = (value: number) => decimal.format(value);
export const formatNumber = (value: number) => integer.format(value);
export const formatTime = (iso: string) => time.format(new Date(iso));

export function daysBetween(from: string | Date, to: string | Date) {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / DAY_MS);
}

export function formatRelativeDays(iso: string, reference: string) {
  return relative.format(daysBetween(reference, iso), "day");
}

/** plural(1, "aluno") → "1 aluno"; plural(2, "aluno") → "2 alunos". */
export function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${formatNumber(count)} ${count === 1 ? singular : pluralForm}`;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
