/**
 * Utilitários de cor (sem dependências): contraste WCAG 2.x e matiz em OKLCH.
 * Base da validação de cor de marca do white label (docs/planos/fase-c.md, C9): a cor escolhida pelo personal
 * precisa passar AA e ficar longe (em matiz) das cores semânticas de erro/evitar e de cautela.
 */

export type Rgb = { r: number; g: number; b: number };

export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex({ r, g, b }: Rgb): string {
  const h = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** Luminância relativa (WCAG 2.x). */
export function luminance(c: Rgb): number {
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/** Razão de contraste WCAG entre duas cores hex (1–21). */
export function contrast(a: string, b: string): number {
  const ca = parseHex(a), cb = parseHex(b);
  if (!ca || !cb) return 1;
  const [l1, l2] = [luminance(ca), luminance(cb)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** OKLCH (L 0–1, C, H em graus) a partir de hex. */
export function oklch(hex: string): { l: number; c: number; h: number } {
  const rgb = parseHex(hex);
  if (!rgb) return { l: 0, c: 0, h: 0 };
  const r = lin(rgb.r), g = lin(rgb.g), b = lin(rgb.b);
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return { l: L, c: Math.hypot(A, B), h: (h + 360) % 360 };
}

/** Menor distância entre dois matizes (0–180°). */
export function hueDistance(a: string, b: string): number {
  const d = Math.abs(oklch(a).h - oklch(b).h) % 360;
  return d > 180 ? 360 - d : d;
}

/** Mistura linear em sRGB (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a)!, cb = parseHex(b)!;
  return toHex({ r: ca.r + (cb.r - ca.r) * t, g: ca.g + (cb.g - ca.g) * t, b: ca.b + (cb.b - ca.b) * t });
}
