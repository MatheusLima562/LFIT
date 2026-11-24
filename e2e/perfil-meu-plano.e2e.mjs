import "./_guard.mjs";
import { waitLoggedIn } from "./_login.mjs";
import { seedIds } from "./_fixtures.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const { createClient } = require("@supabase/supabase-js");
const BASE = process.env.BASE ?? "http://localhost:3000", OUT = process.env.OUT, PW = process.env.SEED_USER_PASSWORD;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const browser = await chromium.launch({ channel: "chrome" });
let fails = 0;
const ok = (n, c, e = "") => { console.log(`${c ? "✓" : "✗"} ${n}${e ? " — " + e : ""}`); if (!c) fails++; };
const visible = (loc, timeout = 15000) => loc.first().waitFor({ timeout }).then(() => true, () => false);

// Perfil do aluno (sprint edição, PARTE 0) a 375 px: sem "Estúdio" e sem "Atendimento"; bloco "Meu plano" com nome,
// vencimento + prazo e o próximo valor em aberto. Dados próprios: o plano ativo da Camila ganha vencimento em 12 dias e
// um pagamento pendente marcado; tudo volta ao estado do seed no fim.
const spDay = (offset) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + offset * 86_400_000));
const br = (iso) => iso.split("-").reverse().join("/");
const { camila, org } = await seedIds(admin);
const { data: active } = await admin.from("training_plans").select("id, name, ends_on, no_end").eq("student_id", camila).eq("status", "active").single();
let payId = null;

try {
  const ends = spDay(12);
  await admin.from("training_plans").update({ ends_on: ends, no_end: false }).eq("id", active.id);
  const { data: p, error } = await admin.from("payments").insert({ organization_id: org, student_id: camila, amount_cents: 24990, due_date: spDay(3) }).select("id").single();
  if (error) throw new Error(error.message);
  payId = p.id;

  const page = await (await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })).newPage();
  page.errors = []; page.on("pageerror", (e) => page.errors.push(e.message));
  await page.goto(`${BASE}/aluno/entrar`);
  await page.getByLabel("E-mail").fill("aluno.seed@example.com");
  await page.getByLabel("Senha", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Entrar" }).click();
  await waitLoggedIn(page, `${BASE}/aluno`);
  await page.goto(`${BASE}/aluno/perfil`);

  const main = page.getByRole("main");
  const block = page.getByRole("region", { name: "Meu plano" });
  ok("bloco 'Meu plano' visível", await visible(block));
  const text = await block.innerText();
  ok("nome do plano", text.includes(active.name), text);
  ok("vencimento com prazo ('vence em 12 dias')", text.includes(br(ends)) && text.includes("vence em 12 dias"), text);
  ok("valor em aberto do próximo vencimento", /R\$\s?249,90/.test(text) && text.includes(br(spDay(3))), text);
  const all = await main.innerText();
  ok("sem 'Estúdio' e sem 'Atendimento' no Perfil", !/Estúdio|Atendimento/.test(all));
  ok("professor e acesso continuam", all.includes("Acesso ao app") && /Seu professor|Seu personal/.test(all));
  ok("sem rolagem horizontal a 375 px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.screenshot({ path: `${OUT}/perfil-meu-plano-375.png`, fullPage: true });

  // Vencido há 3 dias.
  await admin.from("training_plans").update({ ends_on: spDay(-3) }).eq("id", active.id);
  await page.reload();
  ok("plano vencido: 'vencido há 3 dias'", (await block.innerText()).includes("vencido há 3 dias"));

  // Sem plano ativo: o bloco some.
  await admin.from("training_plans").update({ status: "draft" }).eq("id", active.id);
  await page.reload();
  await main.getByText("Acesso ao app").waitFor();
  ok("sem plano ativo: bloco não aparece", (await page.getByRole("region", { name: "Meu plano" }).count()) === 0);
  ok("sem erro de página", page.errors.length === 0, page.errors.join(" | "));
} catch (e) {
  ok("roteiro terminou", false, e.message);
} finally {
  await admin.from("training_plans").update({ status: "active", ends_on: active.ends_on, no_end: active.no_end }).eq("id", active.id);
  if (payId) await admin.from("payments").delete().eq("id", payId);
  await browser.close();
}
process.exit(fails ? 1 : 0);
