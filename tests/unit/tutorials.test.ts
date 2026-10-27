import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isAvailableRoute } from "@/data/navigation";
import { collectLinks, parseInline, parseMarkdown } from "@/features/help/markdown";
import { AUDIENCES, duplicateSlugs, parseTutorial, sortTutorials } from "@/features/help/tutorials";
import { tutorialVideoEmbed } from "@/features/help/video";

const ROOT = path.join(process.cwd(), "content", "tutoriais");

/** Todos os .md das pastas de público (o README da raiz não é tutorial). */
function allFiles() {
  return readdirSync(ROOT)
    .filter((d) => statSync(path.join(ROOT, d)).isDirectory())
    .flatMap((folder) =>
      readdirSync(path.join(ROOT, folder))
        .filter((f) => f.endsWith(".md"))
        .map((f) => ({ folder, slug: f.replace(/\.md$/, ""), raw: readFileSync(path.join(ROOT, folder, f), "utf8") })),
    );
}

describe("content/tutoriais: todos os arquivos", () => {
  const files = allFiles();

  it("há pastas só para os públicos conhecidos e pelo menos um tutorial do professor", () => {
    const folders = readdirSync(ROOT).filter((d) => statSync(path.join(ROOT, d)).isDirectory());
    for (const f of folders) expect(AUDIENCES as readonly string[], `pasta desconhecida: ${f}`).toContain(f);
    expect(files.some((f) => f.folder === "professor")).toBe(true);
  });

  it.each(allFiles().map((f) => [`${f.folder}/${f.slug}.md`, f] as const))("%s: frontmatter válido", (_name, f) => {
    const t = parseTutorial(f.slug, f.raw, f.folder);
    expect(t.title.length).toBeGreaterThan(0);
    expect(t.summary.length).toBeGreaterThan(0);
    expect(Number.isInteger(t.order)).toBe(true);
    expect(t.body.length).toBeGreaterThan(0);
  });

  it("nenhum slug repetido entre as pastas (a URL /ajuda/<slug> é única)", () => {
    expect(duplicateSlugs(files.map((f) => f.slug))).toEqual([]);
  });

  it("links: só internos, para telas disponíveis (nada de link morto) ou âncoras que existem", () => {
    for (const f of files) {
      expect(f.raw, `${f.slug}: link externo não é permitido`).not.toMatch(/\]\((?:https?:)?\/\//);
      const blocks = parseMarkdown(parseTutorial(f.slug, f.raw, f.folder).body);
      const anchors = new Set(blocks.flatMap((b) => (b.kind === "heading" ? [b.id] : [])));
      for (const link of collectLinks(blocks)) {
        if (link.href.startsWith("#")) expect(anchors.has(link.href.slice(1)), `${f.slug}: âncora ${link.href}`).toBe(true);
        else expect(isAvailableRoute(link.href), `${f.slug}: ${link.href} não é uma tela disponível`).toBe(true);
      }
    }
  });

  it("video_url, quando existe, é um endereço aceito (YouTube ou Loom) — a página ignoraria qualquer outro", () => {
    for (const f of files) {
      const { videoUrl } = parseTutorial(f.slug, f.raw, f.folder);
      if (videoUrl) expect(tutorialVideoEmbed(videoUrl), `${f.slug}: video_url não aceito`).not.toBeNull();
    }
  });

  it("não usa '#' de título principal (o título vem do frontmatter)", () => {
    for (const f of files) expect(parseTutorial(f.slug, f.raw, f.folder).body, f.slug).not.toMatch(/^#\s/m);
  });
});

describe("parseTutorial: validação do frontmatter", () => {
  const ok = "---\ntitle: T\nsummary: S\naudience: professor\norder: 2\nupdated: 2026-10-14\n---\n\nCorpo";

  it("lê os campos e o corpo", () => {
    expect(parseTutorial("02-teste", ok)).toMatchObject({ slug: "02-teste", title: "T", audience: "professor", order: 2, updated: "2026-10-14", videoUrl: null, body: "Corpo" });
  });
  it("video_url é opcional e lido como texto", () => {
    const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    expect(parseTutorial("x", ok.replace("updated:", `video_url: ${url}\nupdated:`)).videoUrl).toBe(url);
  });
  it("falha sem frontmatter", () => expect(() => parseTutorial("x", "# sem frontmatter")).toThrow(/frontmatter ausente/));
  it("falha com campo obrigatório ausente", () => expect(() => parseTutorial("x", ok.replace("summary: S\n", ""))).toThrow(/summary/));
  it("falha com order não numérico", () => expect(() => parseTutorial("x", ok.replace("order: 2", "order: dois"))).toThrow(/order/));
  it("falha com data inexistente", () => expect(() => parseTutorial("x", ok.replace("2026-10-14", "2026-02-30"))).toThrow(/updated/));
  it("falha com data em outro formato", () => expect(() => parseTutorial("x", ok.replace("2026-10-14", "14/10/2026"))).toThrow(/updated/));
  it("falha com audience desconhecido ou diferente da pasta", () => {
    expect(() => parseTutorial("x", ok.replace("audience: professor", "audience: financeiro"))).toThrow(/audience/);
    expect(() => parseTutorial("x", ok, "aluno")).toThrow(/pasta/);
  });
  it("falha com slug fora do padrão", () => expect(() => parseTutorial("Tour Do Professor", ok)).toThrow(/slug/));
  it("detecta slug duplicado e ordena por order", () => {
    expect(duplicateSlugs(["a", "b", "a"])).toEqual(["a"]);
    const base = { title: "x", summary: "s", audience: "professor" as const, updated: "2026-10-14", videoUrl: null };
    expect(sortTutorials([{ ...base, slug: "b", order: 2 }, { ...base, slug: "a", order: 1 }]).map((t) => t.slug)).toEqual(["a", "b"]);
  });
});

describe("parseMarkdown: subconjunto suportado", () => {
  it("títulos com âncora, parágrafos, listas e dica", () => {
    const blocks = parseMarkdown("## Como entrar\n\nTexto em\nduas linhas.\n\n1. Um\n2. Dois\n\n- a\n- b\n\n> Dica **forte**");
    expect(blocks.map((b) => b.kind)).toEqual(["heading", "paragraph", "list", "list", "callout"]);
    expect(blocks[0]).toMatchObject({ level: 2, id: "como-entrar" });
    expect(blocks[1]).toMatchObject({ content: [{ kind: "text", text: "Texto em duas linhas." }] });
    expect(blocks[2]).toMatchObject({ ordered: true, items: [[{ text: "Um" }], [{ text: "Dois" }]] });
  });
  it("títulos iguais ganham âncoras diferentes", () => {
    const ids = parseMarkdown("## Dúvidas\n\n## Dúvidas").flatMap((b) => (b.kind === "heading" ? [b.id] : []));
    expect(ids).toEqual(["duvidas", "duvidas-2"]);
  });
  it("inline: negrito, código e link interno; externo vira texto", () => {
    expect(parseInline("**A** `b` [c](/alunos) [d](https://x.com)")).toEqual([
      { kind: "strong", text: "A" },
      { kind: "text", text: " " },
      { kind: "code", text: "b" },
      { kind: "text", text: " " },
      { kind: "link", text: "c", href: "/alunos" },
      { kind: "text", text: " " },
      { kind: "text", text: "d" },
    ]);
  });
  it("HTML no texto continua texto (o React escapa)", () => {
    expect(parseInline("<script>alert(1)</script>")).toEqual([{ kind: "text", text: "<script>alert(1)</script>" }]);
    expect(parseInline("[x](//evil.com)")).toEqual([{ kind: "text", text: "x" }]);
  });
});

describe("tutorialVideoEmbed: só YouTube e Loom", () => {
  const LOOM_ID = "0123456789abcdef0123456789abcdef";
  it("YouTube (watch, youtu.be, shorts) vira embed youtube-nocookie", () => {
    for (const url of ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ", "https://youtube.com/shorts/dQw4w9WgXcQ"]) {
      expect(tutorialVideoEmbed(url)).toEqual({ src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", provider: "YouTube" });
    }
  });
  it("Loom (share e embed) vira embed do Loom", () => {
    for (const url of [`https://www.loom.com/share/${LOOM_ID}`, `https://loom.com/embed/${LOOM_ID}?sid=abc`]) {
      expect(tutorialVideoEmbed(url)).toEqual({ src: `https://www.loom.com/embed/${LOOM_ID}`, provider: "Loom" });
    }
  });
  it("qualquer outro endereço é ignorado", () => {
    for (const url of [
      "https://vimeo.com/123456789",
      "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
      `https://loom.com.evil.example/share/${LOOM_ID}`,
      `https://www.loom.com/share/${LOOM_ID}x`,
      "https://www.youtube.com/watch?v=curto",
      "javascript:alert(1)",
      "",
      null,
    ]) {
      expect(tutorialVideoEmbed(url), String(url)).toBeNull();
    }
  });
});
