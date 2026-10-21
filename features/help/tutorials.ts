/** Tutoriais (content/tutoriais/<público>/<slug>.md): leitura do frontmatter e validação — lógica pura. */
import { withBrand } from "@/features/brand/config";

export const AUDIENCES = ["professor", "aluno"] as const;
export type Audience = (typeof AUDIENCES)[number];

export interface TutorialMeta {
  slug: string;
  title: string;
  summary: string;
  audience: Audience;
  order: number;
  /** AAAA-MM-DD */
  updated: string;
  /** Opcional (`video_url`): vídeo no topo do tutorial; só YouTube ou Loom (ver video.ts), o resto é ignorado. */
  videoUrl: string | null;
}

export interface Tutorial extends TutorialMeta {
  body: string;
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const REQUIRED = ["title", "summary", "audience", "order", "updated"] as const;

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function unquote(value: string) {
  const v = value.trim();
  return (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")) ? v.slice(1, -1) : v;
}

/**
 * Lê um tutorial. Frontmatter: bloco entre `---` no topo, uma linha `chave: valor` por campo (sem YAML aninhado).
 * Lança Error com a lista de problemas (o teste unitário roda isto em todos os arquivos).
 */
export function parseTutorial(slug: string, raw: string, folderAudience?: string): Tutorial {
  const problems: string[] = [];
  // {{marca}} no texto vira o nome do app (features/brand/config.ts): trocar o nome não exige editar tutoriais.
  const text = withBrand(raw.replace(/\r\n/g, "\n"));
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) throw new Error(`${slug}: frontmatter ausente (bloco --- no topo do arquivo)`);

  const fields: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    if (!line.trim()) continue;
    const idx = line.indexOf(":");
    if (idx <= 0) {
      problems.push(`linha inválida no frontmatter: "${line}"`);
      continue;
    }
    fields[line.slice(0, idx).trim()] = unquote(line.slice(idx + 1));
  }

  for (const key of REQUIRED) if (!fields[key]) problems.push(`campo obrigatório ausente: ${key}`);
  if (!SLUG_PATTERN.test(slug)) problems.push(`slug inválido "${slug}" (use minúsculas, números e hífens)`);
  if (fields.audience && !AUDIENCES.includes(fields.audience as Audience)) problems.push(`audience inválido: ${fields.audience}`);
  if (folderAudience && fields.audience && fields.audience !== folderAudience) {
    problems.push(`audience "${fields.audience}" diferente da pasta "${folderAudience}"`);
  }
  if (fields.order && !/^\d+$/.test(fields.order)) problems.push(`order precisa ser um número inteiro: ${fields.order}`);
  if (fields.updated && !isValidDate(fields.updated)) problems.push(`updated precisa ser uma data válida AAAA-MM-DD: ${fields.updated}`);

  if (problems.length) throw new Error(`${slug}: ${problems.join("; ")}`);
  return {
    slug,
    title: fields.title,
    summary: fields.summary,
    audience: fields.audience as Audience,
    order: Number(fields.order),
    updated: fields.updated,
    videoUrl: fields.video_url || null,
    body: text.slice(match[0].length).trim(),
  };
}

export function sortTutorials<T extends TutorialMeta>(list: T[]): T[] {
  return [...list].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "pt-BR"));
}

/** Slugs repetidos (entre todas as pastas): a URL /ajuda/<slug> precisa ser única. */
export function duplicateSlugs(slugs: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const s of slugs) (seen.has(s) ? dup : seen).add(s);
  return [...dup];
}
