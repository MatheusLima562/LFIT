import "./_guard.mjs";
import { waitLoggedIn } from "./_login.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const { createClient } = require("@supabase/supabase-js");
const BASE = process.env.BASE ?? "http://localhost:3000", PW = process.env.SEED_USER_PASSWORD;
const browser = await chromium.launch({ channel: "chrome" });
let fails = 0;
const ok = (n, c, e = "") => { console.log(`${c ? "✓" : "✗"} ${n}${e ? " — " + e : ""}`); if (!c) fails++; };
const settle = (p) => p.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
const FAILED = "Não foi possível falar com o servidor";
const toastWith = async (p, text) => { await p.locator("[data-sonner-toast]", { hasText: text }).last().waitFor({ timeout: 10000 }).catch(() => {}); return (await p.locator("[data-sonner-toast]", { hasText: text }).count()) > 0; };
const crashed = async (p) => /couldn.t load/.test(await p.locator("body").innerText());

// Montador: server action que não chega ao servidor (rede caiu, servidor reiniciado, versão nova publicada) não pode
// derrubar a página inteira ("This page couldn't load"). Vira um aviso e a tela continua com o que o professor fez.
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(`${BASE}/entrar`);
await page.getByLabel("E-mail").fill("owner.seed@example.com");
await page.getByLabel("Senha", { exact: true }).fill(PW);
await page.getByRole("button", { name: "Entrar" }).click();
await waitLoggedIn(page, `${BASE}/`);

let blocked = false;
await page.route("**/*", (route) => (blocked && route.request().headers()["next-action"] ? route.abort("connectionreset") : route.continue()));

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: org } = await admin.from("organizations").select("id").eq("slug", "studio-exemplo").single();
const { data: studs } = await admin.from("students").select("id").eq("organization_id", org.id).order("enrollment_number");
const NOVO = `/treinos/novo?aluno=${studs[3].id}`;

try {
  await page.goto(`${BASE}${NOVO}`);
  await settle(page);
  await page.getByRole("button", { name: "Adicionar exercício" }).click();
  const sheet = page.getByRole("dialog");
  const search = sheet.getByLabel("Buscar exercício");
  await search.waitFor();
  await sheet.getByText("Supino reto com barra").first().waitFor({ timeout: 15000 });

  // 1. Busca do seletor sem servidor: aviso, a página continua e a lista anterior fica.
  blocked = true;
  await search.fill("agachamento");
  ok("busca sem servidor: aviso de conexão", await toastWith(page, FAILED));
  ok("busca sem servidor: a página não cai", !(await crashed(page)) && (await search.isVisible()));

  // 2. Servidor de volta: a busca funciona de novo, sem recarregar.
  blocked = false;
  await search.fill("supino");
  ok("servidor de volta: a busca responde", await sheet.getByText("Supino reto com barra").first().waitFor({ timeout: 15000 }).then(() => true, () => false));

  // 3. Salvar sem servidor: aviso, o rascunho continua na tela (nada perdido).
  await sheet.getByRole("button", { name: /^Supino reto com barra/ }).first().click();
  await sheet.waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
  blocked = true;
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  ok("salvar sem servidor: aviso de conexão", await toastWith(page, FAILED));
  ok("salvar sem servidor: continua no montador com o exercício", !(await crashed(page)) && page.url().endsWith(NOVO) && (await page.getByText("Supino reto com barra").first().isVisible()));
  blocked = false;
} finally {
  await browser.close();
}
if (fails) { console.log(`\n${fails} falha(s).`); process.exit(1); }
