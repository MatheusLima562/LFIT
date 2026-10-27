/** Datas civis no formato brasileiro (dd/mm/aaaa) ↔ ISO (aaaa-mm-dd). */

const TZ = "America/Sao_Paulo";

/** "31/12/2026" → "2026-12-31"; null se inválida (inclui 31/02 etc.). */
export function parseBRDate(value: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  if (d.getUTCFullYear() !== Number(yyyy) || d.getUTCMonth() !== Number(mm) - 1 || d.getUTCDate() !== Number(dd)) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

/** "2026-12-31" → "31/12/2026". */
export function isoToBR(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Hoje (data civil) em São Paulo, aaaa-mm-dd. */
export function todayISO(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}

/** Data civil em São Paulo de um timestamp, aaaa-mm-dd. */
export function timestampToISODate(ts: string) {
  return todayISO(new Date(ts));
}

/** Máscara enquanto digita: "3112" → "31/12". */
export function maskBRDate(input: string) {
  const digits = input.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join("/");
}

/** Fim do dia civil em São Paulo (acesso vale até 23:59:59 da data escolhida). SP não tem horário de verão desde 2019. */
export function endOfDayBR(iso: string) {
  return `${iso}T23:59:59-03:00`;
}

/** ISO ↔ Date local (para o calendário), sem deslocar o dia. */
export const isoToLocalDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const localDateToISO = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
