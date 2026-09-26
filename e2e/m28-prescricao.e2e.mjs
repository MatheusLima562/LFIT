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
await page.goto(`${BASE}/treinos/${p0.id}/editar`); await settle(page);
// Dados migrados aparecem na prescrição nova ("Mais opções" abre sozinho quando há unidade ≠ reps ou complemento)
const plank = page.locator("[role=tabpanel] li", { hasText: "Prancha lateral" }).first();
ok("migrado: prancha em segundos 20–30", (await plank.getByRole("combobox", { name: /^Unidade(?! da carga)/ }).innerText()).includes("Segundos") && (await plank.getByLabel("Segundos Mín.").inputValue()) === "20" && (await plank.getByLabel("Segundos Máx.").inputValue()) === "30");
const deadbug = page.locator("[role=tabpanel] li", { hasText: "Dead bug" }).first();
ok("migrado: 8 por lado", (await deadbug.getByLabel("Repetições Mín.").inputValue()) === "8" && (await deadbug.getByLabel("Complemento").inputValue()) === "por lado");

// Editar prescrição: intensidade em texto livre, cadência (em "Mais opções"), pausa, unidade
const pallof = page.locator("[role=tabpanel] li", { hasText: "Pallof press" }).first();
await pallof.getByLabel("Intensidade", { exact: true }).first().fill("RIR 2");
const pallofMore = pallof.getByRole("button", { name: "Mais opções de Pallof press" });
if ((await pallofMore.getAttribute("aria-expanded")) !== "true") await pallofMore.click();
await pallof.getByRole("radio", { name: "Cadência" }).click();
await pallof.getByLabel("Cadência", { exact: true }).fill("30x0");
await pallof.getByLabel("Pausa (s) Mín.").fill("90");
await pallof.getByLabel("Pausa (s) Máx.").fill("60");
await page.getByRole("button", { name: "Salvar alterações" }).click();
ok("validação: pausa invertida", await pallof.getByText("A pausa máxima deve ser maior ou igual à mínima.").waitFor({ timeout: 5000 }).then(() => true, () => false));
await pallof.getByLabel("Pausa (s) Máx.").fill("120");
await pallof.getByRole("combobox", { name: /^Unidade(?! da carga)/ }).click();
await page.getByRole("option", { name: "Até a falha" }).click();
ok("até a falha esconde a quantidade", (await pallof.getByLabel("Repetições Mín.").count()) === 0);

// Séries detalhadas: gerar do resumo copia tudo; menu duplicar/mover/remover
await pallof.getByRole("button", { name: /Detalhar séries/ }).click();
await pallof.getByRole("button", { name: "Gerar a partir do resumo" }).click();
ok("gerou 3 séries com a prescrição", (await pallof.getByText(/^Série \d$/).count()) === 3 && (await pallof.getByLabel("Cadência", { exact: true }).nth(1).inputValue()) === "30x0");
await pallof.getByRole("button", { name: "Ações da série 1" }).click();
await page.getByRole("menuitem", { name: "Duplicar" }).click();
ok("duplicou", (await pallof.getByText(/^Série \d$/).count()) === 4);
await pallof.getByRole("button", { name: "Ações da série 4" }).click();
await page.getByRole("menuitem", { name: "Remover" }).click();
ok("removeu", (await pallof.getByText(/^Série \d$/).count()) === 3);
await page.screenshot({ path: `${OUT}/01-prescricao.png`, fullPage: true });
await page.getByRole("button", { name: "Salvar alterações" }).click();
ok("salvo", await toastWith(page, "Treino salvo"));
const { data: ws } = await admin.from("plan_workouts").select("id").eq("plan_id", p0.id);
const pallofId = (await admin.from("exercises").select("id").is("organization_id", null).eq("name", "Pallof press").single()).data.id;
const { data: item } = await admin.from("plan_workout_items").select("id, quantity_unit, intensity, tempo, speed, rest_min, rest_max").in("workout_id", ws.map((w) => w.id)).eq("exercise_id", pallofId);
ok("banco: prescrição nova", item[0].quantity_unit === "failure" && item[0].intensity === "RIR 2" && item[0].tempo === "30X0" && item[0].rest_min === 90 && item[0].rest_max === 120, JSON.stringify(item[0]));
const { count } = await admin.from("plan_item_sets").select("id", { count: "exact", head: true }).eq("item_id", item[0].id);
ok("3 séries gravadas", count === 3);

// Impressão
await page.goto(`${BASE}/treinos/${p0.id}/imprimir`); await settle(page);
const txt = await page.locator("article").innerText();
ok("impressão: colunas novas e valores", /QUANTIDADE/i.test(txt) && /INTENSIDADE/i.test(txt) && /20–30 s/.test(txt) && /RIR 2/.test(txt) && /Cadência 30X0/.test(txt) && /90–120 s/.test(txt), "");
await page.screenshot({ path: `${OUT}/02-impressao.png`, fullPage: true });
const pm = await login("owner.seed@example.com", { width: 390, height: 844 });
await pm.goto(`${BASE}/treinos/${p0.id}/editar`); await settle(pm);
ok("mobile sem rolagem horizontal", !(await pm.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
await pm.screenshot({ path: `${OUT}/03-mobile.png`, fullPage: true });
for (const p of [page, pm]) ok("sem erros de JS", p.errors.length === 0, p.errors.join(" | "));
console.log(fails ? `${fails} falha(s)` : "Tudo ok");
await browser.close();
