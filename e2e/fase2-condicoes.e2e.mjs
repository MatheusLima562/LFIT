import "./_guard.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const BASE = process.env.BASE ?? "http://localhost:3000", OUT = process.env.OUT, PW = process.env.SEED_USER_PASSWORD;
const browser = await chromium.launch({ channel: "chrome" });
let fails = 0;
const ok = (n, c, e = "") => { console.log(`${c ? "✓" : "✗"} ${n}${e ? " — " + e : ""}`); if (!c) fails++; };
const settle = (p) => p.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
const toastWith = async (p, text) => { await p.locator("[data-sonner-toast]", { hasText: text }).last().waitFor({ timeout: 15000 }).catch(() => {}); return (await p.locator("[data-sonner-toast]", { hasText: text }).count()) > 0; };
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
await admin.from("health_conditions").delete().not("organization_id", "is", null).or("name.eq.coluna LOMBAR,name.like.Estenose de canal%");
const page = await login("owner.seed@example.com");
await page.getByRole("navigation", { name: "Menu principal" }).getByRole("button", { name: "Treinos & Exercícios" }).click();
await page.getByRole("link", { name: "Condições de saúde" }).click();
await page.waitForURL(/\/treinos\/condicoes/); await settle(page);
ok("catálogo global listado", (await page.getByText("Coluna lombar", { exact: true }).count()) === 1);
ok("condição própria do seed", (await page.getByText("Estenose foraminal (exemplo)", { exact: true }).count()) === 1);
await page.screenshot({ path: `${OUT}/01-condicoes.png`, fullPage: true });
const NAME = `Estenose de canal ${String(Date.now()).slice(-4)}`;
await page.getByRole("button", { name: "Nova condição" }).click();
const d = page.getByRole("dialog");
await d.getByLabel("Nome da condição").fill(NAME);
await d.getByLabel("Descrição (opcional)").fill("Piora com extensão lombar");
await d.getByRole("button", { name: "Criar condição" }).click();
ok("condição criada", await toastWith(page, "Condição criada"));
await page.getByRole("button", { name: "Nova condição" }).click();
await d.getByLabel("Nome da condição").fill("coluna LOMBAR");
await d.getByRole("button", { name: "Criar condição" }).click();
ok("nome igual ao do catálogo recusado", await d.getByText("já existe no catálogo LFit").waitFor({ timeout: 15000 }).then(() => true, () => false));
await d.getByRole("button", { name: "Cancelar" }).click();
await page.getByRole("button", { name: "Nova condição" }).click();
await d.getByLabel("Nome da condição").fill(NAME.toUpperCase());
await d.getByRole("button", { name: "Criar condição" }).click();
ok("duplicado na equipe recusado", await d.getByText("Já existe uma condição").waitFor({ timeout: 15000 }).then(() => true, () => false));
await d.getByRole("button", { name: "Cancelar" }).click();

// Grupo ↔ condição
await page.goto(`${BASE}/alunos/grupos`); await settle(page);
await page.getByRole("button", { name: "Editar grupo: Dor no Joelho" }).click();
const g = page.getByRole("dialog");
ok("condição ligada no seed aparece marcada", (await g.getByRole("button", { name: "Dor patelofemoral", pressed: true }).count()) === 1);
await g.getByRole("button", { name: NAME }).click();
await page.screenshot({ path: `${OUT}/02-grupo-condicoes.png` });
await g.getByRole("button", { name: "Salvar" }).click();
ok("grupo salvo", await toastWith(page, "atualizado"));
await settle(page);
ok("card do grupo lista condições", await page.locator("li", { hasText: "Dor no Joelho" }).getByText(NAME).waitFor({ timeout: 10000 }).then(() => true, () => false));
await page.screenshot({ path: `${OUT}/03-grupos.png` });

// Arquivar (owner) → some do grupo; restaurar → volta
await page.goto(`${BASE}/treinos/condicoes`); await settle(page);
await page.getByRole("button", { name: `Arquivar: ${NAME}` }).click();
await page.getByRole("alertdialog").getByRole("button", { name: "Arquivar" }).click();
ok("arquivada", await toastWith(page, "Condição arquivada"));
await page.goto(`${BASE}/alunos/grupos`); await settle(page);
ok("arquivada some do card do grupo", (await page.locator("li", { hasText: "Dor no Joelho" }).getByText(NAME).count()) === 0);
await page.getByRole("button", { name: "Editar grupo: Dor no Joelho" }).click();
await g.getByRole("button", { name: "Salvar" }).click();
await toastWith(page, "atualizado");
await page.goto(`${BASE}/treinos/condicoes`); await settle(page);
await page.getByRole("button", { name: `Restaurar: ${NAME}` }).click();
ok("restaurada", await toastWith(page, "Condição restaurada"));
await page.goto(`${BASE}/alunos/grupos`); await settle(page);
ok("vínculo preservado após salvar o grupo com a condição arquivada", (await page.locator("li", { hasText: "Dor no Joelho" }).getByText(NAME).count()) === 1);

// Trainer: não arquiva
const p2 = await login("trainer1.seed@example.com");
await p2.goto(`${BASE}/treinos/condicoes`); await settle(p2);
ok("trainer sem botão arquivar", (await p2.getByRole("button", { name: /^Arquivar:/ }).count()) === 0);
ok("trainer edita condição própria", (await p2.getByRole("button", { name: `Editar condição: ${NAME}` }).count()) === 1);

const pm = await login("owner.seed@example.com", { width: 390, height: 844 }, "dark");
await pm.goto(`${BASE}/treinos/condicoes`); await settle(pm);
ok("mobile sem rolagem horizontal", !(await pm.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
await pm.screenshot({ path: `${OUT}/04-mobile-dark.png` });
for (const p of [page, p2, pm]) ok("sem erros de JS", p.errors.length === 0, p.errors.join(" | "));
console.log(fails ? `${fails} falha(s)` : "Tudo ok");
await browser.close();
