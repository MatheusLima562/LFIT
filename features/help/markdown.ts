/**
 * Markdown mínimo dos tutoriais, convertido em estrutura (nada de HTML cru — o React escapa todo o texto).
 * Suportado: `##`/`###`, parágrafos, listas `1.` e `-` (um item por linha), citação `>` (dica em destaque),
 * `**negrito**`, `` `código` `` e links internos `[texto](/rota)` ou `[texto](#ancora)`. O resto vira texto.
 */
import { slugify } from "@/lib/text";

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "heading"; level: 2 | 3; id: string; content: Inline[] }
  | { kind: "paragraph"; content: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "callout"; content: Inline[] };

/** Links aceitos: rota interna ("/alunos") ou âncora ("#secao"). Externos viram texto. */
export const isSafeHref = (href: string) => /^\/(?!\/)[^\s]*$/.test(href) || /^#[a-z0-9-]+$/.test(href);

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: "strong", text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: "code", text: m[2] });
    else if (isSafeHref(m[4])) out.push({ kind: "link", text: m[3], href: m[4] });
    else out.push({ kind: "text", text: m[3] });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

const ORDERED = /^\d+\.\s+(.*)$/;
const UNORDERED = /^[-*]\s+(.*)$/;

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const usedIds = new Set<string>();
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let callout: string[] = [];

  const flush = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", content: parseInline(paragraph.join(" ")) });
    if (list) blocks.push({ kind: "list", ordered: list.ordered, items: list.items.map(parseInline) });
    if (callout.length) blocks.push({ kind: "callout", content: parseInline(callout.join(" ")) });
    paragraph = [];
    list = null;
    callout = [];
  };

  for (const raw of source.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const text = heading[2].trim();
      let id = slugify(text, 60) || "secao";
      for (let n = 2; usedIds.has(id); n++) id = `${slugify(text, 56)}-${n}`;
      usedIds.add(id);
      blocks.push({ kind: "heading", level: heading[1].length as 2 | 3, id, content: parseInline(text) });
      continue;
    }
    const ordered = ORDERED.exec(line);
    const unordered = UNORDERED.exec(line);
    if (ordered || unordered) {
      const isOrdered = Boolean(ordered);
      if (paragraph.length || callout.length || (list && list.ordered !== isOrdered)) flush();
      list ??= { ordered: isOrdered, items: [] };
      list.items.push((ordered ?? unordered)![1]);
      continue;
    }
    if (line.startsWith(">")) {
      if (paragraph.length || list) flush();
      callout.push(line.replace(/^>\s?/, ""));
      continue;
    }
    if (list || callout.length) flush();
    paragraph.push(line);
  }
  flush();
  return blocks;
}

/** Todos os links de um texto (para o teste de "nada de link morto"). */
export function collectLinks(blocks: Block[]): { text: string; href: string }[] {
  const inlines = blocks.flatMap((b) => (b.kind === "list" ? b.items.flat() : b.content));
  return inlines.flatMap((i) => (i.kind === "link" ? [{ text: i.text, href: i.href }] : []));
}
