import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALLOWED_DEV_PROJECT_REFS, devProjectProblem, projectRefFromUrl } from "../../scripts/dev-guard.mts";

/**
 * Trava de ambiente: seed, seed --reset, seed de demonstração e testes de banco só rodam nos projetos de dev da lista
 * única de scripts/dev-guard.mts. Tudo aqui simula URLs — nenhum teste toca em banco.
 */
const DEV = `https://${ALLOWED_DEV_PROJECT_REFS[0]}.supabase.co`;
const OTHER = "https://abcdefghijklmnopqrst.supabase.co"; // um projeto qualquer (ex.: produção)

describe("devProjectProblem (lógica pura)", () => {
  it("lista única com o lfit-dev", () => {
    expect(ALLOWED_DEV_PROJECT_REFS).toEqual(["fwbpazxawtxuppuczijd"]);
    expect(projectRefFromUrl(DEV)).toBe("fwbpazxawtxuppuczijd");
    expect(projectRefFromUrl("https://example.com")).toBeNull();
  });

  it("libera só o projeto de dev, com ALLOW_DB_TESTS=true e o CLI no mesmo projeto", () => {
    expect(devProjectProblem({ url: DEV, allowDbTests: "true", linkedRef: ALLOWED_DEV_PROJECT_REFS[0] })).toBeNull();
    expect(devProjectProblem({ url: DEV, allowDbTests: "true", linkedRef: null })).toBeNull();
  });

  it("recusa outro projeto com mensagem clara", () => {
    expect(devProjectProblem({ url: OTHER, allowDbTests: "true" })).toMatch(/projeto "abcdefghijklmnopqrst".*não está na lista/);
  });

  it("recusa sem a flag, com URL inválida ou com o CLI linkado a outro projeto", () => {
    expect(devProjectProblem({ url: DEV, allowDbTests: undefined })).toMatch(/ALLOW_DB_TESTS/);
    expect(devProjectProblem({ url: "localhost", allowDbTests: "true" })).toMatch(/inválida/);
    expect(devProjectProblem({ url: "https://fwbpazxawtxuppuczijd.supabase.co.evil.example", allowDbTests: "true" })).toMatch(/inválida/);
    expect(devProjectProblem({ url: DEV, allowDbTests: "true", linkedRef: "abcdefghijklmnopqrst" })).toMatch(/linkado/);
  });
});

describe("testes de banco recusam outro projeto", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("importar tests/db/helpers com a URL de outro projeto falha (não pula em silêncio)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", OTHER);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "chave-falsa");
    vi.stubEnv("SUPABASE_SECRET_KEY", "chave-falsa");
    vi.stubEnv("ALLOW_DB_TESTS", "true");
    vi.resetModules();
    await expect(import("../db/helpers")).rejects.toThrow(/Recusado: .*abcdefghijklmnopqrst/);
  });
});

describe("seed e seed de demonstração recusam outro projeto (processo real, sem banco)", () => {
  const run = (script: string) =>
    spawnSync(process.execPath, [script], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        NEXT_PUBLIC_SUPABASE_URL: OTHER,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "chave-falsa",
        SUPABASE_SECRET_KEY: "chave-falsa",
        SEED_USER_PASSWORD: "senha-falsa-de-teste-123",
        ALLOW_DB_TESTS: "true",
        NODE_ENV: "test",
      },
    });

  it.each(["scripts/seed.mts", "scripts/seed-demo.mts"])("%s sai com erro e explica", (script) => {
    const r = run(script);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Recusado: .*abcdefghijklmnopqrst.*não está na lista/);
  });
});
