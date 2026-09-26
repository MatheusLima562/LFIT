import "./_guard.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const BASE = process.env.BASE ?? "http://localhost:3000", PW = process.env.SEED_USER_PASSWORD;
const browser = await chromium.launch({ channel: "chrome" });
let fails = 0;
const ok = (n, c, e = "") => { console.log(`${c ? "✓" : "✗"} ${n}${e ? " — " + e : ""}`); if (!c) fails++; };
const settle = (p) => p.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
async function login(email, viewport = { width: 1440, height: 900 }, scheme = "light") {
  const page = await (await browser.newContext({ viewport, colorScheme: scheme })).newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.errors = errors;
  await page.goto(`${BASE}/entrar`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 30000 });
  return page;
}
for (const [vp, scheme] of [[{ width: 1440, height: 900 }, "light"], [{ width: 390, height: 844 }, "dark"]]) {
  const p = await login("owner.seed@example.com", vp, scheme);
  await p.goto(`${BASE}/`); await settle(p);
  ok(`${vp.width}: sem banner de oferta`, (await p.getByText("Conteúdos Prontos + Limite em Dobro").count()) === 0);
  ok(`${vp.width}: cards presentes`, (await p.getByText("Acompanhamento de alunos").count()) >= 1 && (await p.getByText("Novos alunos", { exact: true }).count()) >= 1);
  // Retenção e Engajamento escondidos até a 1.6 (dados de exemplo) — nem o card nem a fórmula.
  ok(`${vp.width}: sem Retenção/Engajamento`, (await p.getByText(/^Retenção|Engajamento semanal/).count()) === 0 && (await p.getByRole("button", { name: /^Retenção =/ }).count()) === 0);
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  ok(`${vp.width}: sem rolagem horizontal`, sw <= vp.width, String(sw));
  ok(`${vp.width}: sem erros de página`, p.errors.length === 0, p.errors.join(" | "));
}
await browser.close();
console.log(fails ? `${fails} falha(s)` : "tudo ok");
process.exit(fails ? 1 : 0);
