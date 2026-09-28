import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrast, hueDistance } from "@/lib/color";
import { MIN_HUE_DISTANCE, validateBrandColor } from "@/lib/brand-color";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
/** Valores hex de um bloco (:root { … } ou .dark { … }). */
function tokens(selector: ":root" | ".dark") {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf("\n}", start));
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6});/gi)) out[m[1]] = m[2];
  return out;
}
const light = tokens(":root");
const dark = tokens(".dark");
const BRAND = "#f0642d";

describe("tokens de cor: marca × semântica", () => {
  it.each([
    ["claro", light],
    ["escuro", dark],
  ])("AA (≥ 4.5:1) no tema %s: textos secundários e semânticos", (_, t) => {
    for (const bg of ["surface", "canvas"]) {
      for (const fg of ["ink", "ink-2", "ink-3"]) expect(contrast(t[fg], t[bg]), `${fg}/${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    // Seleção neutra: texto secundário continua legível sobre o fundo selecionado.
    for (const fg of ["ink", "ink-2", "ink-3"]) expect(contrast(t[fg], t["selected-soft"]), `${fg}/selected-soft`).toBeGreaterThanOrEqual(4.5);
    for (const s of ["danger", "warning", "success", "info"]) {
      expect(contrast(t[`${s}-ink`], t[`${s}-soft`]), `${s}-ink/${s}-soft`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t[`${s}-ink`], t.surface), `${s}-ink/surface`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("botão primário: texto branco ≥ 4.5:1", () => {
    expect(contrast("#ffffff", light["primary-bg"])).toBeGreaterThanOrEqual(4.5);
  });

  it("marca longe (em matiz) de danger e warning nos dois temas", () => {
    for (const t of [light, dark]) {
      expect(hueDistance(BRAND, t.danger)).toBeGreaterThanOrEqual(MIN_HUE_DISTANCE);
      expect(hueDistance(BRAND, t.warning)).toBeGreaterThanOrEqual(MIN_HUE_DISTANCE);
    }
  });
});

describe("validação da cor de marca (white label)", () => {
  it("a marca atual do LFit passa e gera as variantes AA", () => {
    const v = validateBrandColor(BRAND);
    expect(v).toMatchObject({ ok: true, issues: [] });
    expect(contrast("#ffffff", v.primaryBg!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v.darkText!, "#181816")).toBeGreaterThanOrEqual(4.5);
  });

  it("recusa cores que se confundem com evitar/erro ou cautela", () => {
    expect(validateBrandColor("#e11d48").issues).toContain("TOO_CLOSE_TO_DANGER"); // vermelho
    expect(validateBrandColor("#dc2626").issues).toContain("TOO_CLOSE_TO_DANGER");
    expect(validateBrandColor("#f59e0b").issues).toContain("TOO_CLOSE_TO_WARNING"); // âmbar
    expect(validateBrandColor("#eab308").issues).toContain("TOO_CLOSE_TO_WARNING"); // amarelo
  });

  it("aceita outras famílias; cinza não tem matiz; cor inválida recusada", () => {
    for (const ok of ["#2563eb", "#7c3aed", "#0f766e", "#16a34a", "#3f3f46"]) expect(validateBrandColor(ok).ok, ok).toBe(true);
    expect(validateBrandColor("azul").issues).toEqual(["INVALID_COLOR"]);
  });

  it("recusa cor muito clara que exigiria ajuste grande para o botão primário", () => {
    expect(validateBrandColor("#f5f5ff").issues).toContain("LOW_CONTRAST");
  });
});
