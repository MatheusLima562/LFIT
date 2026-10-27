import "./_guard.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const BASE = process.env.BASE ?? "http://localhost:3000", OUT = process.env.OUT, PW = process.env.SEED_USER_PASSWORD;
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
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: org } = await admin.from("organizations").select("id").eq("slug", "studio-exemplo").single();
const { data: studs } = await admin.from("students").select("id").eq("organization_id", org.id).order("enrollment_number");
const { data: p0 } = await admin.from("training_plans").select("id, name").eq("student_id", studs[0].id).eq("status", "active").single();
const { data: tpl } = await admin.from("training_plans").select("id").is("student_id", null).eq("organization_id", org.id).eq("name", "Hipertrofia ABC").single();

const page = await login("owner.seed@example.com");
// Entrada pelo menu do plano
await page.goto(`${BASE}/alunos/${studs[0].id}/treinos`); await settle(page);
await page.getByRole("button", { name: `Mais ações para ${p0.name}` }).first().click();
await page.getByRole("menuitem", { name: "Imprimir" }).click();
await page.waitForURL(/\/imprimir$/); await settle(page);
const text = await page.locator("article").innerText();
ok("cabeçalho com aluno, professor e período", /Aluno:/.test(text) && /Professor:/.test(text) && /Período:/.test(text), "");
ok("séries detalhadas impressas", /Série 1/.test(text) && /Aquecimento/.test(text) && /até a falha/i.test(text) && !/falha reps/.test(text));
ok("sem dados de saúde/alertas", !/Dor na Coluna|Hérnia|Coluna lombar|Evitar|Cautela|contraindica/i.test(text));
ok("sem menu lateral", (await page.getByRole("navigation", { name: "Menu principal" }).count()) === 0);
await page.screenshot({ path: `${OUT}/01-tela.png`, fullPage: true });
await page.emulateMedia({ media: "print" });
await page.screenshot({ path: `${OUT}/02-midia-print.png`, fullPage: true });
ok("botões somem na impressão", !(await page.getByRole("button", { name: "Imprimir / Salvar PDF" }).isVisible()));
await page.pdf({ path: `${OUT}/plano-aluno.pdf`, format: "A4", preferCSSPageSize: true });
await page.emulateMedia({ media: "screen" });

// Modelo com bi-sets/tri-set
await page.goto(`${BASE}/treinos/${tpl.id}/imprimir`); await settle(page);
const t2 = await page.locator("article").innerText();
ok("modelo: agrupamentos numerados", /Bi-set/i.test(t2) && /Tri-set/i.test(t2) && /\b2a\b/.test(t2) && /\b2b\b/.test(t2), "");
ok("modelo: sem campos de aluno", !/Aluno:/.test(t2) && /Modelo de treino/.test(t2));
await page.emulateMedia({ media: "print" });
await page.pdf({ path: `${OUT}/modelo.pdf`, format: "A4", preferCSSPageSize: true });
await page.emulateMedia({ media: "screen" });

// Montador → Imprimir
await page.goto(`${BASE}/treinos/${p0.id}/editar`); await settle(page);
ok("link Imprimir no montador", (await page.getByRole("link", { name: "Imprimir" }).getAttribute("href")) === `/treinos/${p0.id}/imprimir`);

// Tema escuro: papel continua branco
const dark = await login("owner.seed@example.com", { width: 1280, height: 900 }, "dark");
await dark.goto(`${BASE}/treinos/${p0.id}/imprimir`); await settle(dark);
await dark.evaluate(() => document.documentElement.classList.add("dark")); await dark.waitForTimeout(300);
const bg = await dark.locator("article").evaluate((el) => getComputedStyle(el).backgroundColor);
ok("papel branco no tema escuro", bg === "rgb(255, 255, 255)", bg);
await dark.screenshot({ path: `${OUT}/03-escuro.png` });

// Mobile
const pm = await login("owner.seed@example.com", { width: 390, height: 844 });
await pm.goto(`${BASE}/treinos/${p0.id}/imprimir`); await settle(pm);
await pm.screenshot({ path: `${OUT}/04-mobile.png` });
ok("mobile sem rolagem horizontal da página", !(await pm.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));

// trainer2 não imprime plano de aluno alheio
const t2p = await login("trainer2.seed@example.com");
await t2p.goto(`${BASE}/treinos/${p0.id}/imprimir`); await settle(t2p);
ok("trainer2: 404 no plano alheio", (await t2p.locator("article").count()) === 0);
for (const p of [page, dark, pm]) ok("sem erros de JS", p.errors.length === 0, p.errors.join(" | "));
console.log(fails ? `${fails} falha(s)` : "Tudo ok");
await browser.close();
