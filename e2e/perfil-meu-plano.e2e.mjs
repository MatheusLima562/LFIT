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
const toast = (p, text) => p.locator("[data-sonner-toast]", { hasText: text }).first().waitFor({ timeout: 15000 }).then(() => true, () => false);

// Perfil do aluno (sprint edição, PARTE 0) a 375 px: sem "Estúdio"/"Atendimento"; bloco "Treino atual" (nome + válido
// até, nunca "vence") e bloco "Plano" (ciclo e valor do cadastro + próximo pagamento com o prazo). O personal preenche o
// plano no cadastro do aluno, também a 375 px. Dados próprios: o treino ativo da Camila ganha término em 12 dias, um
// pagamento pendente e o plano do cadastro; tudo volta ao estado do seed no fim.
const spDay = (offset) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + offset * 86_400_000));
const br = (iso) => iso.split("-").reverse().join("/");
const { camila, org } = await seedIds(admin);
const { data: active } = await admin.from("training_plans").select("id, name, ends_on, no_end").eq("student_id", camila).eq("status", "active").single();
const { data: before } = await admin.from("students").select("billing_cycle, plan_amount_cents").eq("id", camila).single();
let payId = null;

const mobile = async () => {
  const p = await (await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })).newPage();
  p.errors = []; p.on("pageerror", (e) => p.errors.push(e.message));
  return p;
};

try {
  const ends = spDay(12);
  await admin.from("training_plans").update({ ends_on: ends, no_end: false }).eq("id", active.id);
  await admin.from("students").update({ billing_cycle: null, plan_amount_cents: null }).eq("id", camila);
  const { data: p, error } = await admin.from("payments").insert({ organization_id: org, student_id: camila, amount_cents: 24990, due_date: spDay(3) }).select("id").single();
  if (error) throw new Error(error.message);
  payId = p.id;

  // --- Personal preenche o plano no cadastro (375 px) ---------------------------------------------------------------
  const staff = await mobile();
  await staff.goto(`${BASE}/entrar`);
  await staff.getByLabel("E-mail").fill("owner.seed@example.com");
  await staff.getByLabel("Senha", { exact: true }).fill(PW);
  await staff.getByRole("button", { name: "Entrar" }).click();
  await waitLoggedIn(staff, `${BASE}/`);
  await staff.goto(`${BASE}/alunos?editar=${camila}`);
  const dlg = staff.getByRole("dialog");
  await dlg.waitFor();
  await staff.waitForTimeout(400);
  await dlg.getByRole("combobox", { name: "Plano (cobrança)" }).click();
  await staff.getByRole("option", { name: "Mensal" }).click();
  await dlg.getByLabel("Valor do plano (R$)").fill("249,90");
  await dlg.getByRole("button", { name: "Salvar alterações" }).click();
  ok("personal salva o plano no cadastro (375 px)", await toast(staff, "Alterações salvas."));
  const { data: saved } = await admin.from("students").select("billing_cycle, plan_amount_cents").eq("id", camila).single();
  ok("banco: ciclo mensal e R$ 249,90", saved.billing_cycle === "monthly" && saved.plan_amount_cents === 24990, JSON.stringify(saved));
  ok("staff sem erro de página", staff.errors.length === 0, staff.errors.join(" | "));
  await staff.context().close();

  // --- Aluna vê os dois blocos (375 px) -----------------------------------------------------------------------------
  const page = await mobile();
  await page.goto(`${BASE}/aluno/entrar`);
  await page.getByLabel("E-mail").fill("aluno.seed@example.com");
  await page.getByLabel("Senha", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Entrar" }).click();
  await waitLoggedIn(page, `${BASE}/aluno`);
  await page.goto(`${BASE}/aluno/perfil`);

  const main = page.getByRole("main");
  const training = page.getByRole("region", { name: "Treino atual" });
  const billing = page.getByRole("region", { name: "Plano", exact: true });
  ok("bloco 'Treino atual' com nome e 'Válido até'", await visible(training.getByText(`Válido até ${br(ends)}`)) && (await training.innerText()).includes(active.name));
  ok("treino nunca usa 'vence'", !/vence/i.test(await training.innerText()));
  const btext = await billing.innerText();
  ok("bloco 'Plano': 'Plano mensal' e valor", btext.includes("Plano mensal") && /R\$\s?249,90/.test(btext), btext);
  ok("próximo pagamento: valor em dd/mm + 'vence em 3 dias'", btext.includes(`em ${br(spDay(3)).slice(0, 5)}`) && btext.includes("vence em 3 dias"), btext);
  const all = await main.innerText();
  ok("sem 'Estúdio' e sem 'Atendimento' no Perfil", !/Estúdio|Atendimento/.test(all));
  ok("professor e acesso continuam", all.includes("Acesso ao app") && /Seu professor|Seu personal/.test(all));
  ok("sem rolagem horizontal a 375 px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.screenshot({ path: `${OUT}/perfil-meu-plano-375.png`, fullPage: true });

  // Pagamento vencido: o prazo é do pagamento.
  await admin.from("payments").update({ due_date: spDay(-3) }).eq("id", payId);
  await page.reload();
  ok("pagamento vencido: 'vencido há 3 dias'", (await billing.innerText()).includes("vencido há 3 dias"));

  // Sem ciclo cadastrado: só o próximo pagamento. Sem treino ativo: o bloco de treino some.
  await admin.from("students").update({ billing_cycle: null, plan_amount_cents: null }).eq("id", camila);
  await admin.from("training_plans").update({ status: "draft" }).eq("id", active.id);
  await page.reload();
  await main.getByText("Acesso ao app").waitFor();
  const b2 = await billing.innerText();
  ok("sem ciclo: só o próximo pagamento", !b2.includes("Plano mensal") && b2.includes("Próximo pagamento"), b2);
  ok("sem treino ativo: 'Treino atual' não aparece", (await page.getByRole("region", { name: "Treino atual" }).count()) === 0);
  ok("sem erro de página", page.errors.length === 0, page.errors.join(" | "));
} catch (e) {
  ok("roteiro terminou", false, e.message);
} finally {
  await admin.from("training_plans").update({ status: "active", ends_on: active.ends_on, no_end: active.no_end }).eq("id", active.id);
  await admin.from("students").update({ billing_cycle: before.billing_cycle, plan_amount_cents: before.plan_amount_cents }).eq("id", camila);
  if (payId) await admin.from("payments").delete().eq("id", payId);
  await browser.close();
}
process.exit(fails ? 1 : 0);
