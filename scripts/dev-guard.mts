/**
 * Trava de ambiente para tudo que cria ou apaga dados (seed, seed --reset, seed de demonstração, testes de banco,
 * roteiros e2e): só rodam nos projetos Supabase de DESENVOLVIMENTO listados abaixo — hoje só o lfit-dev. O project ref
 * NÃO é segredo (aparece na URL). Para trocar/adicionar um projeto de dev, altere a lista aqui, conscientemente, num
 * commit. NUNCA inclua o projeto de produção.
 */
import { existsSync, readFileSync } from "node:fs";

/** Única fonte dos projetos onde é permitido criar/apagar dados de teste. */
export const ALLOWED_DEV_PROJECT_REFS: readonly string[] = ["fwbpazxawtxuppuczijd"];

/** Compatibilidade: o projeto de dev principal (lfit-dev). */
export const LFIT_DEV_PROJECT_REF = ALLOWED_DEV_PROJECT_REFS[0];

/** Project ref de uma URL do Supabase (`https://<ref>.supabase.co`), ou null se a URL não for desse formato. */
export function projectRefFromUrl(url: string | undefined): string | null {
  let host: string;
  try {
    host = new URL(url ?? "").hostname;
  } catch {
    return null;
  }
  const match = /^([a-z0-9]+)\.supabase\.co$/.exec(host);
  return match ? match[1] : null;
}

/**
 * Por que este ambiente NÃO pode rodar scripts/testes que mexem em dados (null = pode). Lógica pura: recebe a URL, a
 * flag e o ref linkado no CLI, sem tocar em banco nenhum (testada em tests/unit/dev-guard.test.ts).
 */
export function devProjectProblem(input: { url: string | undefined; allowDbTests: string | undefined; linkedRef?: string | null }): string | null {
  if (input.allowDbTests !== "true") return 'ALLOW_DB_TESTS precisa ser "true".';
  const ref = projectRefFromUrl(input.url);
  if (!ref) return "NEXT_PUBLIC_SUPABASE_URL inválida (esperado https://<ref>.supabase.co).";
  if (!ALLOWED_DEV_PROJECT_REFS.includes(ref)) {
    return `NEXT_PUBLIC_SUPABASE_URL aponta para o projeto "${ref}", que não está na lista de projetos de desenvolvimento (${ALLOWED_DEV_PROJECT_REFS.join(", ")}).`;
  }
  if (input.linkedRef && input.linkedRef !== ref) return `o Supabase CLI está linkado a "${input.linkedRef}", não a "${ref}".`;
  return null;
}

function linkedRef(): string | null {
  const linked = "supabase/.temp/project-ref";
  return existsSync(linked) ? readFileSync(linked, "utf8").trim() : null;
}

/** Mensagem completa de recusa, ou null se o ambiente é de desenvolvimento. */
export function devGuardMessage(url: string | undefined): string | null {
  const problem = devProjectProblem({ url, allowDbTests: process.env.ALLOW_DB_TESTS, linkedRef: linkedRef() });
  return problem
    ? `Recusado: ${problem}\nEste comando cria/apaga dados e só roda nos projetos de desenvolvimento (${ALLOWED_DEV_PROJECT_REFS.join(", ")}).`
    : null;
}

/** Para scripts (seed, seed:demo, e2e): encerra o processo com a mensagem se o ambiente não for de dev. */
export function assertDevProject(url: string | undefined) {
  const message = devGuardMessage(url);
  if (message) {
    console.error(message);
    process.exit(1);
  }
}

/** Tamanho mínimo da senha das contas fictícias do seed (nunca escrita no código: vem de SEED_USER_PASSWORD). */
export const SEED_PASSWORD_MIN_LENGTH = 12;

/** Por que a senha do seed não serve (null = serve). Nunca devolve a senha nem parte dela. */
export function seedPasswordProblem(password: string | undefined): string | null {
  if (!password) return "defina SEED_USER_PASSWORD (variável de ambiente; nunca no código).";
  if (password.length < SEED_PASSWORD_MIN_LENGTH) {
    return `SEED_USER_PASSWORD é fraca: use pelo menos ${SEED_PASSWORD_MIN_LENGTH} caracteres.`;
  }
  return null;
}
