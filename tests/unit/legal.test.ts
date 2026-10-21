import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collectLinks, parseMarkdown } from "@/features/help/markdown";
import { LEGAL_DRAFT_NOTICE, PRIVACY_MD, TERMS_MD } from "@/features/legal/texts";

/** Páginas legais: rascunho bem marcado, sem base legal afirmada (as bases ficam "em aberto"), públicas e linkadas. */
describe("páginas legais (rascunho)", () => {
  it("as duas abrem com o aviso de rascunho pendente de revisão jurídica", () => {
    expect(LEGAL_DRAFT_NOTICE).toBe("RASCUNHO, pendente de revisão jurídica");
    for (const md of [PRIVACY_MD, TERMS_MD]) expect(md.trim().startsWith(`> ${LEGAL_DRAFT_NOTICE}`)).toBe(true);
  });

  it("a política lista as bases legais como em aberto, sem afirmar nenhuma", () => {
    const section = PRIVACY_MD.slice(PRIVACY_MD.indexOf("## Bases legais"), PRIVACY_MD.indexOf("## Com quem"));
    expect(section).toContain("[em aberto]");
    expect(section).toMatch(/em discussão/);
    expect(section).toMatch(/art\. 11, I/);
    expect(section).toMatch(/art\. 11, II, "e" e "d"/);
  });

  it("links só internos e para páginas que existem", () => {
    for (const md of [PRIVACY_MD, TERMS_MD]) {
      for (const link of collectLinks(parseMarkdown(md))) expect(["/privacidade", "/termos"]).toContain(link.href);
    }
  });

  it("páginas públicas (proxy) e linkadas no login do professor, do aluno e no cadastro público", () => {
    const proxy = readFileSync("proxy.ts", "utf8");
    expect(proxy).toContain('"/privacidade"');
    expect(proxy).toContain('"/termos"');
    for (const f of ["app/(auth)/layout.tsx", "app/aluno/(acesso)/entrar/page.tsx", "app/cadastro/[token]/page.tsx"]) {
      expect(readFileSync(f, "utf8"), f).toContain("<LegalFooter");
    }
  });
});
