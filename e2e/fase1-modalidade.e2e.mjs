import "./_guard.mjs";
import { waitLoggedIn } from "./_login.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const { createClient } = require("@supabase/supabase-js");
const BASE = process.env.BASE ?? "http://localhost:3000", OUT = process.env.OUT, PW = process.env.SEED_USER_PASSWORD;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const browser = await chromium.launch({ channel: "chrome" });
let fails = 0;
const ok = (n, c, e = "") => { console.log(`${c ? "✓" : "✗"} ${n}${e ? " — " + e : ""}`); if (!c) fails++; };
const settle = (p) => p.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
const toastWith = async (p, text) => { await p.locator("[data-sonner-toast]", { hasText: text }).last().waitFor({ timeout: 15000 }).catch(() => {}); return (await p.locator("[data-sonner-toast]", { hasText: text }).count()) > 0; };

// Base do presencial: modalidade no cadastro (owner), etiqueta na lista e filtro ?modalidade=. Idempotente: volta a
// aluna para "consultoria" no fim.
const { data: org } = await admin.from("organizations").select("id").eq("slug", "studio-exemplo").single();
const { data: target } = await admin.from("students").select("id, first_name, last_name").eq("organization_id", org.id).is("deleted_at", null).eq("status", "active").order("enrollment_number").limit(1).single();
const NAME = `${target.first_name} ${target.last_name}`;

const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.errors = []; page.on("pageerror", (e) => page.errors.push(e.message));
try {
  await page.goto(`${BASE}/entrar`);
  await page.getByLabel("E-mail").fill("owner.seed@example.com");
  await page.getByLabel("Senha", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Entrar" }).click();
  await waitLoggedIn(page, `${BASE}/`);

  await page.goto(`${BASE}/alunos?modalidade=presencial`);
  await settle(page);
  ok("filtro presencial começa sem a aluna", (await page.getByText(NAME).count()) === 0);
  ok("filtro de modalidade com 'Todas · Consultoria · Presencial · Híbrido'",
    (await page.getByRole("navigation", { name: "Modalidade" }).getByRole("link").allInnerTexts()).join("|") === "Todas|Consultoria|Presencial|Híbrido");

  await page.goto(`${BASE}/alunos?editar=${target.id}`);
  const dlg = page.getByRole("dialog");
  await dlg.waitFor();
  await page.waitForTimeout(400);
  ok("formulário mostra Modalidade = Consultoria (padrão)", (await dlg.getByRole("combobox", { name: "Modalidade" }).innerText()).includes("Consultoria"));
  await dlg.getByRole("combobox", { name: "Modalidade" }).click();
  await page.getByRole("option", { name: "Presencial" }).click();
  await dlg.getByRole("button", { name: "Salvar alterações" }).click();
  ok("salvo", await toastWith(page, "Alterações salvas."));
  const { data: after } = await admin.from("students").select("modality").eq("id", target.id).single();
  ok("banco: modalidade = presencial", after.modality === "presencial");

  await page.goto(`${BASE}/alunos?modalidade=presencial`);
  await settle(page);
  const anyVisible = async (locator) => {
    for (const el of await locator.all()) if (await el.isVisible()) return true;
    return false;
  };
  const badgeVisible = () => anyVisible(page.locator("span:text-is('Presencial')"));
  ok("filtro presencial mostra a aluna com a etiqueta", (await anyVisible(page.getByText(NAME))) && (await badgeVisible()));
  ok("aba 'Presencial' marcada no filtro", (await page.getByRole("navigation", { name: "Modalidade" }).getByRole("link", { name: "Presencial" }).getAttribute("aria-current")) === "true");
  await page.screenshot({ path: `${OUT}/modalidade-01-lista.png` });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  ok("375 px: sem rolagem horizontal", (await page.evaluate(() => document.documentElement.scrollWidth)) <= 375);
  ok("375 px: etiqueta visível no card", await badgeVisible());
  await page.screenshot({ path: `${OUT}/modalidade-02-celular.png`, fullPage: true });
  ok("sem erro de página", page.errors.length === 0, page.errors.join(" | "));
} finally {
  await admin.from("students").update({ modality: "consultoria" }).eq("id", target.id);
  await browser.close();
}
if (fails) { console.log(`\n${fails} falha(s).`); process.exit(1); }
