import { describe, expect, it } from "vitest";
import { parseInline, parseTip, sanitizeTip } from "@/lib/rich-tip";

describe("sanitizeTip", () => {
  it("remove HTML e caracteres de controle; mantém negrito e lista", () => {
    expect(sanitizeTip('<script>alert(1)</script>**Coluna** <b>neutra</b>\u0007\n- respire')).toBe("alert(1)**Coluna** neutra\n- respire");
  });
  it("normaliza marcadores de lista e linhas em branco", () => {
    expect(sanitizeTip("* um\n• dois\n\n\n\nfim  ")).toBe("- um\n- dois\n\nfim");
  });
  it("limita a 1000 caracteres", () => {
    expect(sanitizeTip("a".repeat(1200))).toHaveLength(1000);
  });
});

describe("parseTip", () => {
  it("negrito inline; asterisco sem par vira texto", () => {
    expect(parseInline("**a** b **c")).toEqual([{ text: "a", bold: true }, { text: " b **c", bold: false }]);
  });
  it("parágrafos e listas", () => {
    expect(parseTip("Atenção:\n- **joelho** alinhado\n- respire\n\nFim")).toEqual([
      { kind: "paragraph", lines: [[{ text: "Atenção:", bold: false }]] },
      { kind: "list", items: [[{ text: "joelho", bold: true }, { text: " alinhado", bold: false }], [{ text: "respire", bold: false }]] },
      { kind: "paragraph", lines: [[{ text: "Fim", bold: false }]] },
    ]);
  });
  it("marcação não suportada fica como texto", () => {
    expect(parseTip("# título [link](x) _it_")).toEqual([{ kind: "paragraph", lines: [[{ text: "# título [link](x) _it_", bold: false }]] }]);
  });
});
