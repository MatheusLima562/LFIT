import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const CLI_TIMEOUT_MS = 60_000;
/** Único projeto onde os testes podem executar SQL direto (lfit-dev). */
export const LFIT_DEV_REF = "fwbpazxawtxuppuczijd";

/** Projeto vinculado ao CLI (`supabase/.temp/project-ref`); vazio se não houver vínculo. */
export function linkedProjectRef(): string {
  try {
    return readFileSync(join(process.cwd(), "supabase", ".temp", "project-ref"), "utf8").trim();
  } catch {
    return "";
  }
}

/**
 * SQL no banco linkado (Management API), com prazo (regra 7). Antes de executar, confere que o projeto vinculado é o
 * lfit-dev; senão lança e nada roda. Usado só para o que fica fora da API de propósito (schema `private`).
 */
export function sqlLinked(sql: string): unknown[] {
  const ref = linkedProjectRef();
  if (ref !== LFIT_DEV_REF) {
    throw new Error(`Projeto vinculado não é o lfit-dev (${LFIT_DEV_REF}); recebido "${ref || "nenhum"}". Nada foi executado.`);
  }
  const out = execFileSync(join(process.cwd(), "node_modules", ".bin", "supabase"), ["db", "query", "--linked", sql], {
    encoding: "utf8",
    cwd: process.cwd(),
    timeout: CLI_TIMEOUT_MS,
    killSignal: "SIGKILL",
  });
  try {
    return (JSON.parse(out) as { rows?: unknown[] }).rows ?? [];
  } catch {
    return [];
  }
}

/** Só UUID entra em SQL montado à mão (nada de texto livre). */
export function uuidLiteral(id: string): string {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("id inválido");
  return `'${id}'`;
}
