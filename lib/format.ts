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

const dateBR = new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });

/** dd/mm/aaaa no fuso de São Paulo. Datas puras (yyyy-mm-dd) não sofrem deslocamento de fuso. */
export function formatDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }
  return dateBR.format(new Date(value));
}

/** Matrícula com zeros à esquerda (só na exibição). */
export const formatEnrollment = (n: number) => `#${String(n).padStart(4, "0")}`;

/** Idade completa em anos a partir de yyyy-mm-dd. */
export function ageFrom(birthDate: string, today = new Date()) {
  const [y, m, d] = birthDate.split("-").map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age;
}

/** Tamanho em MB/GB (pt-BR): 12,3 MB · 2 GB. */
const upToOneDecimal = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
export function formatBytes(bytes: number) {
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${upToOneDecimal.format(mb / 1024)} GB` : `${upToOneDecimal.format(mb)} MB`;
}
