import { contrast, hueDistance, mix, oklch, parseHex } from "./color";

/**
 * Validação da cor de marca escolhida pelo personal (white label, docs/planos/fase-c.md C9).
 * Regras: (1) a marca nunca pode se confundir com as cores semânticas — matiz (OKLCH) a pelo menos
 * MIN_HUE_DISTANCE de danger (evitar/erro) e warning (cautela), nos dois temas; (2) AA: o botão primário
 * (texto branco) e o texto da marca no tema escuro precisam de ≥ 4.5:1 — derivamos as variantes necessárias
 * escurecendo/clareando a cor; se precisar de ajuste grande demais, a cor é recusada.
 */
export const SEMANTIC_HUES = {
  danger: ["#be123c", "#fb7185"],
  warning: ["#ca8a04", "#facc15"],
} as const;
export const MIN_HUE_DISTANCE = 20;
/** Abaixo desta croma a cor é praticamente cinza: matiz irrelevante. */
const MIN_CHROMA = 0.04;
/** Quanto a cor pode ser escurecida/clareada para passar AA antes de ser recusada. */
const MAX_ADJUST = 0.45;
const AA = 4.5;

export type BrandIssue = "INVALID_COLOR" | "TOO_CLOSE_TO_DANGER" | "TOO_CLOSE_TO_WARNING" | "LOW_CONTRAST";

export interface BrandValidation {
  ok: boolean;
  issues: BrandIssue[];
  /** Fundo do botão primário (texto branco ≥ 4.5:1). */
  primaryBg?: string;
  /** Cor da marca para texto/ícone ativo no tema escuro (≥ 4.5:1 sobre a superfície escura). */
  darkText?: string;
}

/** Escurece (ou clareia) até atingir o contraste pedido; null se exigir ajuste acima de MAX_ADJUST. */
function adjustFor(color: string, against: string, towards: string): string | null {
  for (let t = 0; t <= MAX_ADJUST + 1e-9; t += 0.01) {
    const c = mix(color, towards, t);
    if (contrast(c, against) >= AA) return c;
  }
  return null;
}

export function validateBrandColor(hex: string, surfaces = { light: "#ffffff", dark: "#181816" }): BrandValidation {
  if (!parseHex(hex)) return { ok: false, issues: ["INVALID_COLOR"] };
  const issues: BrandIssue[] = [];
  if (oklch(hex).c >= MIN_CHROMA) {
    if (SEMANTIC_HUES.danger.some((d) => hueDistance(hex, d) < MIN_HUE_DISTANCE)) issues.push("TOO_CLOSE_TO_DANGER");
    if (SEMANTIC_HUES.warning.some((w) => hueDistance(hex, w) < MIN_HUE_DISTANCE)) issues.push("TOO_CLOSE_TO_WARNING");
  }
  const primaryBg = adjustFor(hex, "#ffffff", "#000000");
  const darkText = adjustFor(hex, surfaces.dark, "#ffffff");
  if (!primaryBg || !darkText) issues.push("LOW_CONTRAST");
  return { ok: issues.length === 0, issues, primaryBg: primaryBg ?? undefined, darkText: darkText ?? undefined };
}
