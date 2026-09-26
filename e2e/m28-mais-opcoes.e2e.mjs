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
const { data: org } = await admin.from("organizations").select("id").eq("slug", "studio-exemplo").single();
const { data: studs } = await admin.from("students").select("id").eq("organization_id", org.id).order("enrollment_number");
const page = await login("owner.seed@example.com");
await page.goto(`${BASE}/treinos/novo?aluno=${studs[3].id}`); await settle(page);
await page.getByLabel("Nome do treino").fill("Teste densidade");
await page.getByRole("button", { name: "Adicionar exercício" }).click();
const sheet = page.getByRole("dialog");
await sheet.getByLabel("Buscar exercício").fill("dead bug");
await sheet.getByRole("button", { name: /^Dead bug/ }).first().click();
await page.waitForTimeout(800);
const item = page.locator("[role=tabpanel] li", { hasText: "Dead bug" }).first();
const more = item.getByRole("button", { name: "Mais opções de Dead bug" });
ok("básico à vista: séries, repetições, carga, pausa",
  (await item.getByLabel("Séries", { exact: true }).count()) === 1 &&
  (await item.getByLabel("Repetições Mín.").count()) === 1 && (await item.getByLabel("Repetições Máx.").count()) === 1 &&
  (await item.getByLabel("Carga: Valor").count()) === 1 && (await item.getByLabel("Pausa (s) Mín.").count()) === 1);
ok("Mais opções fechado sem nada preenchido", (await more.getAttribute("aria-expanded")) === "false" &&
  (await item.getByRole("combobox", { name: /^Unidade(?! da carga)/ }).count()) === 0 && (await item.getByRole("textbox", { name: "Dica" }).count()) === 0 &&
  (await item.getByRole("combobox", { name: "Método" }).count()) === 0);
await page.screenshot({ path: `${OUT}/05-item-basico.png`, clip: { x: 250, y: 250, width: 1190, height: 450 } });
await more.click();
ok("Mais opções mostra o resto", (await item.getByRole("combobox", { name: /^Unidade(?! da carga)/ }).count()) === 1 && (await item.getByLabel("Complemento").count()) === 1 &&
  (await item.getByRole("radiogroup", { name: "Velocidade" }).count()) === 1 &&
  (await item.getByRole("textbox", { name: "Dica" }).count()) === 1 && (await item.getByRole("button", { name: "Adicionar substituto" }).count()) === 1);
await item.getByRole("combobox", { name: /^Unidade(?! da carga)/ }).click();
await page.getByRole("option", { name: "Segundos" }).click();
ok("rótulo da quantidade segue a unidade", (await item.getByLabel("Segundos Mín.").count()) === 1);
await item.getByLabel("Complemento").fill("por lado");
ok("contagem de opções preenchidas", /\(2\)/.test(await more.textContent()));
await page.screenshot({ path: `${OUT}/06-item-mais-opcoes.png`, clip: { x: 250, y: 250, width: 1190, height: 650 } });
// Séries detalhadas: mesma lógica
await item.getByRole("button", { name: /Detalhar séries/ }).click();
await item.getByRole("button", { name: /Gerar a partir do resumo|Gerar/ }).first().click();
const set1 = item.locator("ol > li").first();
ok("série: básico à vista", (await set1.getByLabel("Segundos Mín.").count()) === 1 && (await set1.getByLabel("Série 1: Valor").count()) === 1 && (await set1.getByLabel("Pausa (s) Mín.").count()) === 1);
ok("série com opções herdadas abre sozinha", (await set1.getByRole("button", { name: "Mais opções da série 1" }).getAttribute("aria-expanded")) === "true");
await page.screenshot({ path: `${OUT}/07-series.png`, fullPage: true });
await page.getByRole("button", { name: "Salvar rascunho" }).click();
ok("salvo", await toastWith(page, "Treino salvo"));
// Plano com dica salva: abre sozinho
const { data: plan } = await admin.from("training_plans").select("id").eq("name", "Coluna saudável").eq("status", "active").limit(1).single();
await page.goto(`${BASE}/treinos/${plan.id}/editar`); await settle(page);
const withTip = page.locator("[role=tabpanel] li", { has: page.getByRole("textbox", { name: "Dica" }) });
ok("item com dica abre Mais opções sozinho", (await withTip.count()) >= 1);
ok("sem erros de JS", page.errors.length === 0, page.errors.join(" | "));
console.log(fails ? `${fails} falha(s)` : "Tudo ok");
await browser.close();
