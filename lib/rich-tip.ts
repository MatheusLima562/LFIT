/**
 * Dica do exercício com formatação mínima: **negrito** e linhas de lista ("- item").
 * Nunca HTML: o texto é saneado no servidor (sanitizeTip, dentro do schema Zod do plano)
 * e renderizado como elementos React (parseTip → <RichTip/>), que escapam tudo.
 * Qualquer outra marcação (#, _, [links], <tags>) vira texto comum.
 */
export const TIP_MAX = 1000;

/** Normaliza o texto: tira tags HTML e caracteres de controle, apara linhas, limita linhas em branco. */
export function sanitizeTip(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .split("\n")
    .map((l) => normalizeLine(l.replace(/\s+$/g, "").replace(/^\s*[*•]\s+/, "- ")))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, TIP_MAX);
}

export type TipInline = { text: string; bold: boolean };

/**
 * Reescreve uma linha em forma canônica: "- " fora do negrito, negrito aninhado/duplicado
 * ("**- **texto****" → "- **texto**"), trechos em negrito vizinhos unidos, espaços fora dos marcadores.
 * "**" abre quando vem depois de espaço/início, fecha quando vem antes de espaço/fim; colado dos dois
 * lados, alterna. Linha com negrito sem fechamento fica como está (asteriscos viram texto).
 */
export function normalizeLine(line: string): string {
  if (!line.includes("**")) return line;
  const chars: { c: string; bold: boolean }[] = [];
  let depth = 0;
  for (let i = 0; i < line.length; ) {
    if (line.startsWith("**", i)) {
      const prev = chars.at(-1)?.c;
      let j = i;
      while (line.startsWith("**", j)) j += 2;
      const next = line[j];
      for (let k = i; k < j; k += 2) {
        const opens = prev === undefined || /\s/.test(prev) ? true : next === undefined || /\s/.test(next) ? false : depth === 0;
        // Numa sequência "****" colada ao texto, cada par segue a mesma direção.
        depth = opens ? depth + 1 : Math.max(0, depth - 1);
      }
      i = j;
      continue;
    }
    chars.push({ c: line[i], bold: depth > 0 });
    i++;
  }
  if (depth !== 0) return line;
  const plain = chars.map((x) => x.c).join("");
  const list = /^\s*-\s/.exec(plain);
  return (list ? "- " : "") + joinRuns(chars.slice(list ? list[0].length : 0).map((x) => ({ text: x.c, bold: x.bold })));
}

/** Runs → texto com **negrito**; une vizinhos iguais e deixa espaços das pontas fora dos marcadores. */
export function joinRuns(runs: TipInline[]): string {
  const merged: TipInline[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const last = merged.at(-1);
    if (last && last.bold === r.bold) last.text += r.text;
    else merged.push({ ...r });
  }
  return merged
    .map((r) => {
      if (!r.bold || !r.text.trim()) return r.text;
      const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(r.text)!;
      return `${lead}**${core}**${trail}`;
    })
    .join("");
}
export type TipBlock = { kind: "paragraph"; lines: TipInline[][] } | { kind: "list"; items: TipInline[][] };

/** "**a** b" → [{a, bold}, {" b"}]. Asteriscos sem par ficam como texto. */
export function parseInline(line: string): TipInline[] {
  const out: TipInline[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) out.push({ text: line.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), bold: false });
  return out;
}

export function parseTip(text: string): TipBlock[] {
  const blocks: TipBlock[] = [];
  for (const raw of sanitizeTip(text).split("\n")) {
    const last = blocks.at(-1);
    if (raw.trim() === "") {
      blocks.push({ kind: "paragraph", lines: [] });
      continue;
    }
    const item = /^- (.*)$/.exec(raw);
    if (item) {
      if (last?.kind === "list") last.items.push(parseInline(item[1]));
      else blocks.push({ kind: "list", items: [parseInline(item[1])] });
    } else if (last?.kind === "paragraph" && last.lines.length) last.lines.push(parseInline(raw));
    else blocks.push({ kind: "paragraph", lines: [parseInline(raw)] });
  }
  return blocks.filter((b) => (b.kind === "list" ? b.items.length : b.lines.length));
}
