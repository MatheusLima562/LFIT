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
const { data: studs } = await admin.from("students").select("id, enrollment_number").eq("organization_id", org.id).order("enrollment_number");
const sid = (i) => studs[i].id;
const { data: plan0 } = await admin.from("training_plans").select("id").eq("student_id", sid(0)).eq("status", "active").single();
const { data: plan4 } = await admin.from("training_plans").select("id").eq("student_id", sid(4)).eq("status", "active").single();

const page = await login("owner.seed@example.com");
await page.goto(`${BASE}/treinos/${plan0.id}/editar`); await settle(page);
// Seed (2.10): regra global aprovada de cautela (hérnia × terra romeno); "Abdominal supra" tem "evitar" na camada da org.
ok("alerta resumido (cautela global)", (await page.getByRole("status").filter({ hasText: "Alertas de contraindicação" }).getByText("1 com cautela").count()) === 1);
await page.getByRole("tab", { name: /^B/ }).click();
ok("alerta no item com nota", (await page.getByText("Barra elevada (blocos/rack)", { exact: false }).count()) >= 1);
ok("séries detalhadas carregadas", (await page.getByText("Série 3").count()) >= 1);
await page.screenshot({ path: `${OUT}/01-montador-B.png`, fullPage: true });

// Picker com alerta
await page.getByRole("button", { name: "Adicionar exercício" }).click();
const sheet = page.getByRole("dialog");
await sheet.getByLabel("Buscar exercício").fill("abdominal");
await sheet.getByRole("button", { name: /^Abdominal supra/ }).waitFor();
ok("picker mostra alerta antes de escolher", (await sheet.getByRole("button", { name: /^Abdominal supra/ }).getByText("Evitar").count()) === 1);
await page.screenshot({ path: `${OUT}/02-picker.png` });
await sheet.getByRole("button", { name: /^Abdominal supra/ }).click();
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
ok("item novo com alerta; resumo atualizado", (await page.getByRole("status").getByText("1 para evitar · 1 com cautela").count()) === 1);

// Agrupar os dois últimos (Levantamento terra romeno + Abdominal supra)
await page.getByRole("checkbox", { name: "Selecionar Levantamento terra romeno para agrupar" }).click();
await page.getByRole("checkbox", { name: "Selecionar Abdominal supra para agrupar" }).click();
await page.getByRole("button", { name: "Agrupar" }).click();
ok("bi-set criado", (await page.getByText("Bi-set", { exact: true }).count()) === 1);

// Teclado: mover o bi-set para o topo com a alça (espaço, ↑ até o topo, espaço)
const handle = page.getByRole("button", { name: /^Arrastar agrupamento:/ });
await handle.focus();
await page.keyboard.press("Space"); await page.waitForTimeout(150);
for (let i = 0; i < 10; i++) { await page.keyboard.press("ArrowUp"); await page.waitForTimeout(150); }
await page.keyboard.press("Space"); await page.waitForTimeout(400);
const first = await page.locator("[role=tabpanel] ol > li").first().innerText();
ok("teclado moveu o bi-set para o topo", first.includes("Bi-set") && first.includes("Levantamento terra romeno"), first.slice(0, 80));
// ↑↓ dentro do grupo
await page.getByRole("button", { name: "Mover para cima: Abdominal supra" }).click();
const firstAfter = await page.locator("[role=tabpanel] ol > li").first().innerText();
ok("↑ reordena dentro do agrupamento", firstAfter.indexOf("Abdominal supra") < firstAfter.indexOf("Levantamento terra romeno"));
await page.screenshot({ path: `${OUT}/03-biset-topo.png`, fullPage: true });

// Validação: cadência inválida (fica em "Mais opções", modo Cadência)
await page.getByRole("button", { name: "Mais opções de Abdominal supra" }).first().click();
await page.getByRole("radio", { name: "Cadência" }).first().click();
await page.getByLabel("Cadência").first().fill("301");
await page.getByRole("button", { name: "Salvar alterações" }).click();
ok("erro de cadência destacado", await page.getByText("4 dígitos (ex.: 3010; X = explosivo).").first().waitFor({ timeout: 5000 }).then(() => true, () => false));
await page.getByLabel("Cadência").first().fill("3010");
await page.getByRole("button", { name: "Salvar alterações" }).click();
ok("salvo", await toastWith(page, "Treino salvo"));
await page.reload(); await settle(page);
await page.getByRole("tab", { name: /^B/ }).click();
ok("persistiu bi-set no topo após recarregar", (await page.locator("[role=tabpanel] ol > li").first().innerText()).includes("Bi-set"));

// Owner sem consentimento do titular (aluno do trainer1): alertas ocultos
await page.goto(`${BASE}/treinos/${plan4.id}/editar`); await settle(page);
// Consentimento só declarado e owner não é o responsável: nível restrito (só o nível, sem condição/nota) — 2.8.
ok("owner: alerta restrito sem detalhes", (await page.getByText("Você vê só o nível dos alertas").count()) === 1 && (await page.getByText("Amplitude de 90°").count()) === 0);
await page.screenshot({ path: `${OUT}/04-ocultos.png` });
const t1 = await login("trainer1.seed@example.com");
await t1.goto(`${BASE}/treinos/${plan4.id}/editar`); await settle(t1);
await t1.getByRole("tab", { name: /^C/ }).click();
ok("responsável vê o alerta (cautela)", (await t1.getByText("Amplitude de 90° a 45° na fase sensível (exemplo do seed)", { exact: false }).count()) >= 1);

// Novo modelo: sem datas nem alertas; salvar leva à edição
await page.goto(`${BASE}/treinos/novo`); await settle(page);
const c1 = await page.getByLabel("Início", { exact: true }).count(), c2 = await page.getByText("Alertas de contraindicação").count();
ok("modelo sem campos de data", c1 === 0 && c2 === 0, `${c1} ${c2}`);
await page.getByLabel("Nome do treino").fill(`Modelo teste ${String(Date.now()).slice(-4)}`);
await page.getByRole("button", { name: "Adicionar exercício" }).click();
await page.getByRole("dialog").getByRole("button", { name: /^Prancha frontal/ }).click();
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Adicionar divisão" }).click();
ok("divisão B criada", (await page.getByRole("tab", { name: /^B/ }).getAttribute("aria-selected")) === "true");
await page.getByRole("button", { name: "Salvar rascunho" }).click();
ok("modelo salvo", await toastWith(page, "Modelo salvo"));
await page.waitForURL(/\/treinos\/[0-9a-f-]+\/editar/);
ok("redireciona para edição", true);

// Mobile + escuro
const pm = await login("owner.seed@example.com", { width: 390, height: 844 }, "dark");
await pm.goto(`${BASE}/treinos/${plan0.id}/editar`); await settle(pm);
await pm.evaluate(() => document.documentElement.classList.add("dark"));
await pm.waitForTimeout(300);
ok("mobile sem rolagem horizontal", !(await pm.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
await pm.screenshot({ path: `${OUT}/05-mobile-dark.png` });
for (const p of [page, t1, pm]) ok("sem erros de JS", p.errors.length === 0, p.errors.join(" | "));
console.log(fails ? `${fails} falha(s)` : "Tudo ok");
await browser.close();
