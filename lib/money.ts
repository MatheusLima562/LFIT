/** Valores em reais digitados em pt-BR ↔ centavos. */

/** "1.234,56" / "1234,5" / "R$ 99" → centavos. Inválido ou ≤ 0 → null. */
export function parseMoneyToCents(input: string): number | null {
  const clean = input.trim().replace(/^R\$\s*/i, "").replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const cents = Math.round(Number(clean) * 100);
  return cents > 0 && cents <= 100_000_000 ? cents : null;
}

/** 24990 → "249,90" (para preencher um campo de valor). */
export const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
