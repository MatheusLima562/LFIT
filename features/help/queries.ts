import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { type Audience, parseTutorial, sortTutorials, type Tutorial } from "./tutorials";

/** Raiz dos tutoriais. Em produção os arquivos entram no bundle por `outputFileTracingIncludes` (next.config.ts). */
export const TUTORIALS_DIR = path.join(process.cwd(), "content", "tutoriais");

async function readFolder(audience: Audience): Promise<Tutorial[]> {
  const dir = path.join(TUTORIALS_DIR, audience);
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".md"));
  return Promise.all(files.map(async (f) => parseTutorial(f.replace(/\.md$/, ""), await readFile(path.join(dir, f), "utf8"), audience)));
}

/** Tutoriais de um público, na ordem do campo `order`. */
export const listTutorials = cache(async (audience: Audience) => sortTutorials(await readFolder(audience)));

export async function getTutorial(audience: Audience, slug: string): Promise<Tutorial | null> {
  return (await listTutorials(audience)).find((t) => t.slug === slug) ?? null;
}
