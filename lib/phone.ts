import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

export type { CountryCode };
export const DEFAULT_COUNTRY: CountryCode = "BR";

const regionNames = new Intl.DisplayNames(["pt-BR"], { type: "region" });

/** Países com nome em PT-BR e DDI, Brasil primeiro. */
export const phoneCountries = getCountries()
  .map((code) => ({ code, name: regionNames.of(code) ?? code, dial: `+${getCountryCallingCode(code)}` }))
  .sort((a, b) => (a.code === "BR" ? -1 : b.code === "BR" ? 1 : a.name.localeCompare(b.name, "pt-BR")));

export const isCountryCode = (value: string): value is CountryCode => (getCountries() as string[]).includes(value);

/** Máscara conforme o país enquanto digita. */
export function formatPhoneAsYouType(value: string, country: CountryCode) {
  return new AsYouType(country).input(value);
}

export function isValidPhone(value: string, country: string) {
  return isCountryCode(country) && isValidPhoneNumber(value, country);
}

/** Número digitado → E.164 (+5541999990000), ou null se inválido. */
export function toE164(value: string, country: string) {
  if (!isCountryCode(country)) return null;
  const parsed = parsePhoneNumberFromString(value, country);
  return parsed?.isValid() ? parsed.number : null;
}

/** E.164 → país + número nacional formatado (para editar). */
export function fromE164(e164: string | null | undefined): { country: CountryCode; national: string } {
  const parsed = e164 ? parsePhoneNumberFromString(e164) : undefined;
  if (!parsed?.country) return { country: DEFAULT_COUNTRY, national: "" };
  return { country: parsed.country, national: parsed.formatNational() };
}

/** E.164 → exibição com máscara (ex.: (41) 99901-0287 para BR, internacional para os demais). */
export function formatPhoneDisplay(e164: string) {
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return e164;
  return parsed.country === DEFAULT_COUNTRY ? parsed.formatNational() : parsed.formatInternational();
}
