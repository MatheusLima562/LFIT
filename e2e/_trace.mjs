/**
 * Rastro automático dos roteiros e2e (importado pelo `_guard.mjs`, que todo roteiro carrega primeiro).
 *
 * Sem mudar os roteiros: envolve o `chromium.launch` do Playwright (mesmo módulo em cache que os roteiros pegam com
 * `require("@playwright/test")`). Todo contexto grava trace (telas + DOM) e o console/erros de cada página. Quando o
 * roteiro FALHA — uma linha "✗" no console, exceção não tratada ou saída com código ≠ 0 —, salva em
 * `test-results/<roteiro>-<data>/`:
 *   - `trace-N.zip` (abrir com `npx playwright show-trace <arquivo>`),
 *   - `page-N-M.png` (captura de cada página aberta no momento da falha),
 *   - `console.log` (console e erros de página de todas as páginas, na ordem).
 * Roteiro que passa não grava nada. Só dados fictícios do seed (o `_guard` recusa outro projeto).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join } from "node:path";

const require = createRequire(import.meta.url);
const pw = require("@playwright/test");

const script = basename(process.argv[1] ?? "roteiro", ".e2e.mjs");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = join(process.cwd(), "test-results", `${script}-${stamp}`);

let failed = false;
let saved = false;
const consoleLines = [];
const contexts = new Set();
let traceN = 0;

// Uma linha "✗" no console = falha (convenção dos roteiros e do executor).
const origLog = console.log.bind(console);
console.log = (...args) => {
  if (typeof args[0] === "string" && args[0].startsWith("✗")) failed = true;
  origLog(...args);
};

const ensureDir = () => mkdirSync(outDir, { recursive: true });

function watchPage(page) {
  page.on("console", (m) => consoleLines.push(`[console.${m.type()}] ${page.url()} :: ${m.text()}`));
  page.on("pageerror", (e) => consoleLines.push(`[pageerror] ${page.url()} :: ${e.message}`));
  page.on("requestfailed", (r) => consoleLines.push(`[requestfailed] ${r.method()} ${r.url()} :: ${r.failure()?.errorText ?? ""}`));
}

async function saveContext(ctx, index) {
  ensureDir();
  let p = 0;
  for (const page of ctx.pages()) {
    p += 1;
    await page.screenshot({ path: join(outDir, `page-${index}-${p}.png`), fullPage: true, timeout: 10_000 }).catch(() => {});
  }
  await ctx.tracing.stop({ path: join(outDir, `trace-${index}.zip`) }).catch(() => {});
}

/** Salva tudo uma vez (contextos ainda abertos + console). */
async function saveAll(reason) {
  if (saved) return;
  saved = true;
  ensureDir();
  let i = 0;
  for (const ctx of contexts) {
    i += 1;
    await saveContext(ctx, i);
  }
  writeFileSync(join(outDir, "console.log"), `${reason}\n\n${consoleLines.join("\n")}\n`);
  origLog(`  ↳ rastro da falha em ${outDir}`);
}

function wrapContext(ctx) {
  contexts.add(ctx);
  traceN += 1;
  const index = traceN;
  void ctx.tracing.start({ screenshots: true, snapshots: true, title: `${script} #${index}` }).catch(() => {});
  ctx.on("page", watchPage);
  for (const page of ctx.pages()) watchPage(page);
  const origClose = ctx.close.bind(ctx);
  ctx.close = async (...a) => {
    if (contexts.has(ctx)) {
      contexts.delete(ctx);
      // Falha já registrada: guarda o trace deste contexto antes de fechar; senão descarta.
      if (failed) await saveContext(ctx, index);
      else await ctx.tracing.stop().catch(() => {});
    }
    return origClose(...a);
  };
  return ctx;
}

function wrapBrowser(browser) {
  const origNewContext = browser.newContext.bind(browser);
  browser.newContext = async (...a) => wrapContext(await origNewContext(...a));
  // `browser.newPage` cria um contexto implícito: passa pelo mesmo caminho para ter trace.
  browser.newPage = async (opts) => {
    const ctx = await browser.newContext(opts);
    return ctx.newPage();
  };
  const origClose = browser.close.bind(browser);
  browser.close = async (...a) => {
    if (failed) await saveAll("Falha registrada (linha ✗).");
    else for (const ctx of contexts) await ctx.tracing.stop().catch(() => {});
    contexts.clear();
    return origClose(...a);
  };
  return browser;
}

const origLaunch = pw.chromium.launch.bind(pw.chromium);
pw.chromium.launch = async (...a) => wrapBrowser(await origLaunch(...a));

// Exceção não tratada (inclusive await no topo do módulo): salva antes de sair.
const crash = async (e) => {
  failed = true;
  origLog(`✗ exceção não tratada — ${e?.message ?? e}`);
  consoleLines.push(`[exceção] ${e?.stack ?? e}`);
  await saveAll(`Exceção não tratada: ${e?.message ?? e}`).catch(() => {});
  process.exit(1);
};
process.on("uncaughtException", crash);
process.on("unhandledRejection", crash);

// Saída com código ≠ 0 sem browser.close (ex.: process.exit no meio): avisa que o rastro pode não ter sido salvo.
const origExit = process.exit.bind(process);
process.exit = (code) => {
  if (code && !saved && contexts.size) {
    failed = true;
    void saveAll(`Saída com código ${code}.`).finally(() => origExit(code));
    return undefined;
  }
  return origExit(code);
};
