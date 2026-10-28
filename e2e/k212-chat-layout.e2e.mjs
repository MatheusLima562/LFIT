import "./_guard.mjs";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const BASE = process.env.BASE ?? "http://localhost:3000", PW = process.env.SEED_USER_PASSWORD;
// Prints para conferência do dono (fora do git, como os vídeos).
const SHOTS = "tutoriais-video";
mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
let fails = 0;
const ok = (n, c, e = "") => { console.log(`${c ? "✓" : "✗"} ${n}${e ? " — " + e : ""}`); if (!c) fails++; };
const settle = (p) => p.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

// Chat do aluno no celular: cabeçalho compacto e aviso no fluxo, nunca sobre a lista; lista com ≥ 55% da altura.
async function phone(width, height, { brokenStorage = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/aluno/entrar`);
  await page.getByLabel("E-mail").fill("aluno.seed@example.com");
  await page.getByLabel("Senha", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(`${BASE}/aluno`, { timeout: 30000 }).catch(async (e) => {
    console.log(`✗ login travou em ${page.url()}: ${(await page.locator("body").innerText()).slice(0, 300)}`);
    throw e;
  });
  // Storage bloqueado só depois do login (como num modo privado que recusa gravar).
  if (brokenStorage) {
    await page.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new Error("bloqueado"); };
      Storage.prototype.setItem = () => { throw new Error("bloqueado"); };
    });
  }
  await page.goto(`${BASE}/aluno/chat`);
  await settle(page);
  await page.getByText("Combinado, obrigada!").first().waitFor({ timeout: 15000 });
  return page;
}

/** Caixas de cada parte, o que está de fato no topo da lista e se a página rola. */
const measure = (page) =>
  page.evaluate(() => {
    const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
    const list = document.querySelector('ol[aria-live="polite"]').parentElement;
    const h1 = document.querySelector("main h1");
    const notice = document.querySelector("main button[aria-expanded]").parentElement;
    const form = document.querySelector("main textarea").closest("form");
    const nav = document.querySelector('nav[aria-label="Navegação do app"]');
    const appHeader = document.querySelector("body header");
    const l = box(list);
    // O que aparece no topo e no fundo da lista é a própria lista (nada sobreposto)?
    const xs = [20, window.innerWidth / 2, window.innerWidth - 20];
    const covered = [l.top + 2, l.bottom - 2].flatMap((y) => xs.map((x) => !list.contains(document.elementFromPoint(x, y))));
    return {
      vh: window.innerHeight,
      vw: window.innerWidth,
      appHeader: box(appHeader),
      headerRow: box(h1.parentElement),
      notice: box(notice),
      list: l,
      form: box(form),
      nav: nav ? box(nav) : null,
      covered: covered.some(Boolean),
      pageScrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });

function checkLayout(label, m, { minRatio }) {
  const ratio = m.list.height / m.vh;
  ok(`${label}: cabeçalho do professor em uma linha (≤ 56 px)`, m.headerRow.height <= 56, `${m.headerRow.height}px`);
  ok(`${label}: ordem no fluxo — app → professor → aviso → lista → envio → abas`,
    m.appHeader.bottom <= m.headerRow.top + 0.5 && m.headerRow.bottom <= m.notice.top + 0.5 && m.notice.bottom <= m.list.top + 0.5 &&
      m.list.bottom <= m.form.top + 0.5 && (!m.nav || m.form.bottom <= m.nav.top + 0.5),
    JSON.stringify({ app: m.appHeader.bottom, prof: [m.headerRow.top, m.headerRow.bottom], aviso: [m.notice.top, m.notice.bottom], lista: [m.list.top, m.list.bottom], envio: [m.form.top, m.form.bottom], abas: m.nav?.top }));
  ok(`${label}: nada sobrepõe o topo nem o fundo da lista`, !m.covered);
  ok(`${label}: a página não rola (só a lista)`, !m.pageScrolls);
  ok(`${label}: sem rolagem horizontal`, m.scrollWidth <= m.vw);
  if (minRatio) ok(`${label}: lista com ≥ ${Math.round(minRatio * 100)}% da altura`, ratio >= minRatio, `${(ratio * 100).toFixed(1)}%`);
  else console.log(`  ${label}: lista com ${(ratio * 100).toFixed(1)}% da altura`);
}

const shots = [];
try {
  for (const [w, h] of [[375, 667], [390, 844]]) {
    const page = await phone(w, h);
    const notice = page.getByRole("button", { name: /Não é canal de emergência/ });

    // Primeiro acesso neste aparelho: aviso aberto (sem exigência de altura mínima — é a vez em que ele precisa ser lido).
    ok(`${w}×${h} primeiro acesso: aviso aberto com a nota de privacidade`, (await notice.getAttribute("aria-expanded")) === "true" && (await page.getByText("Sua conversa é vista pelo seu professor e pela coordenação do estúdio").isVisible()));
    checkLayout(`${w}×${h} aberto`, await measure(page), { minRatio: 0 });
    await page.screenshot({ path: `${SHOTS}/chat-aluno-${w}x${h}-aberto.png` });
    shots.push(`${SHOTS}/chat-aluno-${w}x${h}-aberto.png`);

    // Próximo acesso: recolhido em uma linha, lista com ≥ 55% da altura.
    await page.reload();
    await settle(page);
    await page.getByText("Combinado, obrigada!").first().waitFor({ timeout: 15000 });
    ok(`${w}×${h} próximo acesso: aviso recolhido em uma linha`, (await notice.getAttribute("aria-expanded")) === "false" && (await page.getByText("Não é canal de emergência · ligue 192").isVisible()) && (await notice.boundingBox()).height <= 48);
    checkLayout(`${w}×${h} recolhido`, await measure(page), { minRatio: 0.55 });
    await page.screenshot({ path: `${SHOTS}/chat-aluno-${w}x${h}-recolhido.png` });
    shots.push(`${SHOTS}/chat-aluno-${w}x${h}-recolhido.png`);

    // A última mensagem fica visível acima do campo de envio (rolada até o fim).
    const last = await page.getByText("Combinado, obrigada!").first().boundingBox();
    const m = await measure(page);
    ok(`${w}×${h}: última mensagem inteira dentro da lista`, last && last.y >= m.list.top && last.y + last.height <= m.list.bottom, `${last?.y} em ${m.list.top}–${m.list.bottom}`);
    await page.context().close();
  }

  // Sem storage (modo privado/bloqueado): o aviso aparece aberto, sempre.
  const blocked = await phone(375, 667, { brokenStorage: true });
  await blocked.reload();
  await settle(blocked);
  ok("storage bloqueado: aviso aberto mesmo depois de recarregar", (await blocked.getByRole("button", { name: /Não é canal de emergência/ }).getAttribute("aria-expanded")) === "true");
  await blocked.context().close();
} finally {
  await browser.close();
}
console.log(`Prints: ${shots.join(", ")}`);
if (fails) { console.log(`\n${fails} falha(s).`); process.exit(1); }
