import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND, studentAppTitle, withBrand } from "@/features/brand/config";
import manifest from "@/app/manifest";
import { parseTutorial } from "@/features/help/tutorials";
import { messages } from "@/messages/pt-BR";

/** Marca centralizada em features/brand/config.ts: trocar o nome do app = editar um arquivo. */
const SCAN = ["app", "components", "features", "lib", "messages", "types", "content/tutoriais/professor", "content/tutoriais/aluno", "e2e"];
const SKIP = new Set(["features/brand/config.ts"]);
const EXT = /\.(ts|tsx|mts|mjs|css|md)$/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === ".output" ? [] : files(path);
    return EXT.test(name) ? [path] : [];
  });
}

describe("marca centralizada", () => {
  it("o nome do app não aparece escrito à mão fora de features/brand/config.ts", () => {
    const offenders = SCAN.flatMap(files)
      .filter((f) => !SKIP.has(f))
      .filter((f) => readFileSync(f, "utf8").includes(BRAND.name));
    expect(offenders).toEqual([]);
  });

  it("a cor da marca é a mesma do token --color-brand-500 do CSS", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const token = /--color-brand-500:\s*(#[0-9a-fA-F]{6})/.exec(css)?.[1];
    expect(token?.toLowerCase()).toBe(BRAND.colors.primary.toLowerCase());
  });

  it("textos, manifest e tutoriais usam a config", () => {
    expect(messages.app.name).toBe(BRAND.name);
    expect(messages.aluno.appName).toBe(BRAND.name);
    const m = manifest();
    expect(m.name).toBe(studentAppTitle);
    expect(m.short_name).toBe(BRAND.name);
    expect(m.theme_color).toBe(BRAND.colors.background);
    expect(withBrand("Bem-vindo ao {{marca}}!")).toBe(`Bem-vindo ao ${BRAND.name}!`);
    const raw = readFileSync("content/tutoriais/professor/01-tour-pela-interface.md", "utf8");
    expect(raw).toContain("{{marca}}");
    const t = parseTutorial("01-tour-pela-interface", raw, "professor");
    expect(`${t.title} ${t.summary} ${t.body}`).not.toContain("{{marca}}");
    expect(t.body).toContain(BRAND.name);
  });
});
