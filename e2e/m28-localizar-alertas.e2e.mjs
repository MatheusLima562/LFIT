import "./_guard.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const { createClient } = require("@supabase/supabase-js");
const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT;
const PW = process.env.SEED_USER_PASSWORD;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const browser = await chromium.launch({ channel: "chrome" });
let fails = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`); if (!cond) fails++; };
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

// Ana Duarte (seed): grupo "Dor na Coluna" → cautela em "Levantamento terra romeno" (divisão B).
const { data: org } = await admin.from("organizations").select("id").eq("slug", "studio-exemplo").single();
const { data: studs } = await admin.from("students").select("id").eq("organization_id", org.id).order("enrollment_number");
const { data: p0 } = await admin.from("training_plans").select("id").eq("student_id", studs[0].id).eq("status", "active").single();

const page = await login("owner.seed@example.com");
await page.goto(`${BASE}/treinos/${p0.id}/editar`); await settle(page);

ok("aba A ativa por padrão", (await page.getByRole("tab", { name: /^A/, selected: true }).count()) === 1);

// 2. Marcador na aba com a cor do pior nível e a contagem.
const tabB = page.getByRole("tab", { name: /^B/ });
// O texto "cautela" fica só no aria-label (ícone e número são decorativos): filtro por atributo, não por texto.
const badge = tabB.locator('[aria-label*="cautela"]');
ok("aba B mostra o marcador de alerta (ícone + contagem)", (await badge.count()) === 1, await tabB.innerText());
ok("aba A sem marcador (sem alerta)", (await page.getByRole("tab", { name: /^A/ }).locator("[aria-label*='cautela'],[aria-label*='evitar']").count()) === 0);

// 1. Resumo lista o exercício clicável (nome · nível · divisão).
const panel = page.getByRole("status").filter({ hasText: "Alertas de contraindicação" });
const link = panel.getByRole("button", { name: /Levantamento terra romeno/ });
ok("resumo lista o exercício com alerta", (await link.count()) === 1);
ok("botão mostra o nível e a divisão", (await link.getByText("Cautela").count()) === 1 && (await link.getByText("B", { exact: true }).count()) === 1);
await page.screenshot({ path: `${OUT}/01-resumo-alertas.png` });

await link.click();
await page.waitForTimeout(700); // troca de divisão + rolagem suave

ok("clique abriu a divisão B", (await tabB.getAttribute("aria-selected")) === "true");
const itemEl = page.locator('[id^="item-"]').filter({ hasText: "Levantamento terra romeno" });
ok("item expandido (campo Séries visível)", (await itemEl.getByLabel("Séries", { exact: true }).count()) === 1);
const box = await itemEl.boundingBox();
ok("item rolado para dentro da tela", !!box && box.y >= 0 && box.y < 900, JSON.stringify(box));
const highlighted = await itemEl.evaluate((el) => el.className.includes("ring-info"));
ok("item recebe destaque temporário ao chegar", highlighted);
await page.screenshot({ path: `${OUT}/02-item-localizado.png` });

// O destaque some sozinho depois de um tempo.
await page.waitForTimeout(1500);
ok("destaque some depois de alguns segundos", !(await itemEl.evaluate((el) => el.className.includes("ring-info"))));

// 3. Recolhido, o item mantém o selo de nível visível.
await itemEl.getByRole("button", { name: /^Recolher/ }).click();
ok("recolhido mantém o selo de nível visível", (await itemEl.getByText("Cautela", { exact: true }).count()) >= 1);
ok("recolhido mostra o resumo em uma linha", (await itemEl.getByLabel("Séries", { exact: true }).count()) === 0);
await page.screenshot({ path: `${OUT}/03-item-recolhido-com-selo.png` });

// Clicar de novo no mesmo item (já expandido/visível) ainda funciona (token novo por clique).
await itemEl.getByRole("button", { name: /^Expandir/ }).click();
await link.click();
await page.waitForTimeout(700);
ok("clicar de novo no mesmo alerta funciona", (await itemEl.evaluate((el) => el.className.includes("ring-info"))));

ok("sem erros de página", page.errors.length === 0, page.errors.join(" | "));
await browser.close();
console.log(fails ? `${fails} falha(s)` : "Tudo ok");
process.exit(fails ? 1 : 0);
