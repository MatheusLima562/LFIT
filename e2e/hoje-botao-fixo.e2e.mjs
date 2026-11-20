import "./_guard.mjs";
import { waitLoggedIn } from "./_login.mjs";
import { resetAbsence, resetCamilaSessions, seedIds } from "./_fixtures.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const { createClient } = require("@supabase/supabase-js");
const BASE = process.env.BASE ?? "http://localhost:3000", OUT = process.env.OUT, PW = process.env.SEED_USER_PASSWORD;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const browser = await chromium.launch({ channel: "chrome" });
let fails = 0;
const ok = (n, c, e = "") => { console.log(`${c ? "✓" : "✗"} ${n}${e ? " — " + e : ""}`); if (!c) fails++; };
const overlap = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// Botão fixo "Começar treino {letra}" no Hoje (1.7) a 375×667 e 390×844: acima da barra de abas, sem cobrir nada (nem o
// fim da página rolada). Dados próprios: Camila sem treinos (início e fim).
const { camila } = await seedIds(admin);
let created = null;
try {
  await resetCamilaSessions(admin);
  await resetAbsence(admin, camila);
  for (const [w, h] of [[375, 667], [390, 844]]) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true })).newPage();
    page.errors = []; page.on("pageerror", (e) => page.errors.push(e.message));
    await page.goto(`${BASE}/aluno/entrar`);
    await page.getByLabel("E-mail").fill("aluno.seed@example.com");
    await page.getByLabel("Senha", { exact: true }).fill(PW);
    await page.getByRole("button", { name: "Entrar" }).click();
    await waitLoggedIn(page, `${BASE}/aluno`);

    const bar = page.getByTestId("sticky-start");
    const button = bar.getByRole("button", { name: /^Começar treino [A-Z]$/ });
    ok(`${w}×${h}: botão fixo 'Começar treino {letra}'`, (await button.count()) === 1, await bar.innerText().catch(() => ""));
    const nav = page.getByRole("navigation", { name: "Navegação do app" });
    const barBox = await bar.boundingBox();
    const navBox = await nav.boundingBox();
    ok(`${w}×${h}: logo acima da barra de abas, sem sobrepor`, barBox && navBox && !overlap(barBox, navBox) && Math.abs(barBox.y + barBox.height - navBox.y) <= 1, JSON.stringify([barBox, navBox]));
    ok(`${w}×${h}: dentro da tela`, barBox && barBox.y >= 0 && barBox.y + barBox.height <= h);

    // No fim da página, o último bloco de conteúdo fica acima do botão fixo.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    const lastBlock = await page.evaluate(() => {
      const blocks = [...document.querySelectorAll("main > div > section, main > div > details")];
      const r = blocks.at(-1)?.getBoundingClientRect();
      return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
    });
    const barAfter = await bar.boundingBox();
    ok(`${w}×${h}: fim da página não fica por baixo do botão`, lastBlock && barAfter && lastBlock.y + lastBlock.height <= barAfter.y + 1, JSON.stringify([lastBlock, barAfter]));
    ok(`${w}×${h}: sem rolagem horizontal`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.screenshot({ path: `${OUT}/hoje-botao-fixo-${w}.png` });

    if (w === 375) {
      await button.click();
      await page.waitForURL(/\/aluno\/treino\/[0-9a-f-]+/, { timeout: 20000 });
      created = page.url().split("/treino/")[1].split("?")[0];
      ok("o botão fixo inicia o treino sugerido", Boolean(created));
      await page.goto(`${BASE}/aluno`);
      ok("com treino aberto vira 'Retomar treino'", (await bar.getByRole("link", { name: "Retomar treino" }).count()) === 1);
    }
    ok(`${w}×${h}: sem erro de página`, page.errors.length === 0, page.errors.join(" | "));
    await page.context().close();
  }
} catch (e) {
  ok("roteiro terminou", false, e.message);
} finally {
  await resetCamilaSessions(admin).catch(() => {});
  await browser.close();
}
process.exit(fails ? 1 : 0);
