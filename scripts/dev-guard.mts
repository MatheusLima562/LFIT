/**
 * Trava para scripts destrutivos (seed, --reset): só rodam no projeto Supabase de
 * DESENVOLVIMENTO (lfit-dev). O project ref abaixo NÃO é segredo (aparece na URL).
 * Para trocar o projeto de dev, altere-o aqui conscientemente, em um commit.
 */
import { existsSync, readFileSync } from "node:fs";

export const LFIT_DEV_PROJECT_REF = "fwbpazxawtxuppuczijd";

export function assertDevProject(url: string | undefined) {
  const fail = (msg: string): never => {
    console.error(`Recusado: ${msg}\nEste script apaga/cria dados e só roda no lfit-dev (${LFIT_DEV_PROJECT_REF}).`);
    process.exit(1);
  };

  if (process.env.ALLOW_DB_TESTS !== "true") fail("ALLOW_DB_TESTS precisa ser \"true\".");

  let host = "";
  try {
    host = new URL(url ?? "").hostname;
  } catch {
    fail("NEXT_PUBLIC_SUPABASE_URL inválida.");
  }
  if (host !== `${LFIT_DEV_PROJECT_REF}.supabase.co`) fail(`NEXT_PUBLIC_SUPABASE_URL aponta para "${host}".`);

  // Se o CLI estiver linkado, também precisa ser o lfit-dev.
  const linked = "supabase/.temp/project-ref";
  if (existsSync(linked)) {
    const ref = readFileSync(linked, "utf8").trim();
    if (ref !== LFIT_DEV_PROJECT_REF) fail(`o Supabase CLI está linkado a "${ref}".`);
  }
}
