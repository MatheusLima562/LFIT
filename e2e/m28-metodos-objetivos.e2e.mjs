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
const { data: p0 } = await admin.from("training_plans").select("id").eq("student_id", studs[0].id).eq("status", "active").single();

const page = await login("owner.seed@example.com");
// Listas (owner)
await page.goto(`${BASE}/treinos/listas`); await settle(page);
const methods = page.getByRole("region", { name: /Métodos/ });
ok("valores iniciais", (await methods.getByText("Rest-pause", { exact: true }).count()) === 1 && (await page.getByRole("region", { name: /Objetivos/ }).getByText("Correção postural").count()) === 1);
await methods.getByLabel("Novo item em Métodos").fill("Tempo sob tensão");
await methods.getByRole("button", { name: "Adicionar" }).click();
ok("item adicionado", await toastWith(page, "Item adicionado"));
await settle(page);
await methods.getByRole("button", { name: "Mover Tempo sob tensão para cima" }).click();
await page.waitForFunction(() => { const t = [...document.querySelectorAll("section li p.truncate")].map((p) => p.textContent); const i = t.findIndex((x) => x && x.startsWith("Tempo sob tensão")); return i > -1 && t[i + 1]?.startsWith("Alongamento passivo"); }, null, { timeout: 10000 }).catch(() => {});
const order = await methods.locator("li p.truncate").allInnerTexts();
ok("reordenado", order.indexOf("Tempo sob tensão") === order.length - 2, order.slice(-3).join(","));
await methods.getByRole("button", { name: "Arquivar Tempo sob tensão" }).click();
ok("arquivado", await toastWith(page, "Item arquivado"));
await page.screenshot({ path: `${OUT}/01-listas.png`, fullPage: true });
const t1 = await login("trainer1.seed@example.com");
await t1.goto(`${BASE}/treinos/listas`); await settle(t1);
ok("trainer: só leitura", (await t1.getByText("Somente o administrador altera estas listas.").count()) === 1 && (await t1.getByRole("button", { name: "Adicionar" }).count()) === 0);

// Montador: substitutos, método/objetivo, dica
await page.goto(`${BASE}/treinos/${p0.id}/editar`); await settle(page);
await page.getByRole("tab", { name: /^B/ }).click();
const card = page.locator("[role=tabpanel] li", { hasText: "Levantamento terra romeno" }).first();
ok("substitutos do seed", (await card.getByText("Elevação pélvica").count()) >= 1 && (await card.getByText("Ponte de glúteos").count()) >= 1);
await card.getByRole("button", { name: "Adicionar substituto" }).click();
const sheet = page.getByRole("dialog");
await sheet.getByLabel("Buscar exercício").fill("abdominal supra");
await sheet.getByRole("button", { name: /Abdominal supra/ }).click();
ok("substituto adicionado", await toastWith(page, "adicionado como substituto"));
ok("substituto com alerta (Evitar)", (await card.locator("li", { hasText: "Abdominal supra" }).getByText("Evitar").count()) === 1);
ok("limite de 3: botão some", (await card.getByRole("button", { name: "Adicionar substituto" }).count()) === 0);
await card.getByRole("combobox", { name: "Método" }).click();
await page.getByRole("option", { name: "Drop-set" }).click();
await card.getByRole("combobox", { name: "Objetivo" }).click();
await page.getByRole("option", { name: "Força" }).click();
// Dica: editor visual (negrito e lista visíveis enquanto digita), convertido para texto saneado ao salvar.
const tip = card.getByRole("textbox", { name: "Dica" });
await tip.click();
// O seed já traz uma dica: limpa antes de digitar.
await page.keyboard.press("ControlOrMeta+A");
await page.keyboard.press("Backspace");
await page.keyboard.type("Coluna neutra");
await page.keyboard.press("Shift+Home");
await card.getByRole("button", { name: "Negrito" }).click();
await page.keyboard.press("ArrowRight");
await page.keyboard.press("Enter");
await card.getByRole("button", { name: "Lista" }).click();
await page.keyboard.type("respire na subida<img src=x onerror=alert(1)>");
ok("negrito e lista no editor", (await tip.locator("b, strong", { hasText: "Coluna neutra" }).count()) >= 1 && (await tip.locator("li", { hasText: "respire" }).count()) === 1);
await page.screenshot({ path: `${OUT}/02-item.png`, fullPage: true });
await page.getByRole("button", { name: "Salvar alterações" }).click();
ok("salvo", await toastWith(page, "Treino salvo"));
const { data: saved } = await admin.from("plan_workout_items").select("tip, method_id, objective_id").ilike("tip", "%Coluna neutra%").limit(1).single();
ok("dica saneada no banco (markdown simples, sem HTML)", saved.tip.startsWith("**Coluna neutra**") && /^- .*respire/m.test(saved.tip) && !/<img|onerror/.test(saved.tip) && saved.method_id && saved.objective_id, saved.tip);
await page.reload(); await settle(page);
await page.getByRole("tab", { name: /^B/ }).click();
ok("persistiu 3 substitutos", (await page.locator("[role=tabpanel] li", { hasText: "Levantamento terra romeno" }).first().getByRole("button", { name: /^Remover substituto/ }).count()) === 3);

// Impressão
await page.goto(`${BASE}/treinos/${p0.id}/imprimir`); await settle(page);
const art = page.locator("article");
ok("impressão: método/objetivo/substitutos", /Método: Drop-set/.test(await art.innerText()) && /Substitutos: .*Abdominal supra/.test(await art.innerText()));
ok("impressão: dica formatada sem ** e sem HTML", (await art.locator("strong", { hasText: "Coluna neutra" }).count()) === 1 && !/\*\*/.test(await art.innerText()) && (await art.locator("img").count()) === 0);
ok("impressão sem saúde", !/Evitar|Hérnia|Dor na Coluna/.test(await art.innerText()));
await page.screenshot({ path: `${OUT}/03-impressao.png`, fullPage: true });
for (const p of [page, t1]) ok("sem erros de JS", p.errors.length === 0, p.errors.join(" | "));
console.log(fails ? `${fails} falha(s)` : "Tudo ok");
await browser.close();
