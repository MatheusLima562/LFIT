import "./_guard.mjs";
import { waitLoggedIn } from "./_login.mjs";
import { setPlatformAdmin, setSeedSubscription } from "./_fixtures.mjs";
import { totpCode } from "../scripts/totp.mts";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const { createClient } = require("@supabase/supabase-js");
const BASE = process.env.BASE ?? "http://localhost:3000", OUT = process.env.OUT, PW = process.env.SEED_USER_PASSWORD;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const browser = await chromium.launch({ channel: "chrome" });
let fails = 0;
const ok = (n, c, e = "") => { console.log(`${c ? "✓" : "✗"} ${n}${e ? " — " + e : ""}`); if (!c) fails++; };
const toast = (p, text) => p.locator("[data-sonner-toast]", { hasText: text }).first().waitFor({ timeout: 15000 }).then(() => true, () => false);
const visible = (loc, timeout = 15000) => loc.first().waitFor({ timeout }).then(() => true, () => false);

// Painel da plataforma (desktop) e inadimplência (painel do personal + app do aluno a 375 px). Dados próprios: um admin
// da plataforma criado aqui (senha gerada, entra na lista por SQL com a trava do lfit-dev), a conta nova criada pelo
// roteiro e a situação da assinatura do seed — tudo desfeito no fim.
const RUN = Date.now().toString(36);
const platformEmail = `lfit-test-plataforma-${RUN}@example.com`;
const platformPw = `Pw-${randomUUID()}`;
const newEmail = `lfit-test-personal-${RUN}@example.com`;
let platformUserId = null;

async function login(path, email, password, viewport = { width: 1440, height: 900 }) {
  const mobile = viewport.width < 500;
  const page = await (await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile })).newPage();
  page.errors = []; page.on("pageerror", (e) => page.errors.push(e.message));
  await page.goto(`${BASE}${path}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  return page;
}

try {
  await setSeedSubscription(admin, "active");
  const { data: u, error } = await admin.auth.admin.createUser({ email: platformEmail, password: platformPw, email_confirm: true });
  if (error) throw new Error(error.message);
  platformUserId = u.user.id;
  setPlatformAdmin(platformUserId);

  // --- Quem não está na lista não vê a área -------------------------------------------------------------------------
  const owner = await login("/entrar", "owner.seed@example.com", PW);
  await waitLoggedIn(owner, `${BASE}/`);
  const res = await owner.goto(`${BASE}/plataforma`);
  ok("personal (fora da lista) recebe 404 em /plataforma", res?.status() === 404, String(res?.status()));

  // --- Admin da plataforma -------------------------------------------------------------------------------------------
  const plat = await login("/entrar", platformEmail, platformPw);
  // MFA: sem o segundo fator, o painel manda para a verificação (cadastro do autenticador com QR code).
  await plat.waitForURL(`${BASE}/plataforma-verificacao`, { timeout: 30000 });
  ok("admin sem MFA cai na verificação em duas etapas", plat.url() === `${BASE}/plataforma-verificacao`);
  await plat.getByRole("button", { name: "Gerar QR code" }).click();
  ok("QR code do autenticador aparece", await visible(plat.getByRole("img", { name: "QR code do autenticador" })));
  await plat.screenshot({ path: `${OUT}/plataforma-00-mfa.png`, fullPage: true });
  const secret = (await plat.getByTestId("mfa-secret").innerText()).trim();
  await plat.getByLabel("Código").fill("000000");
  await plat.getByRole("button", { name: "Confirmar" }).click();
  ok("código errado é recusado", await visible(plat.getByRole("alert")));
  await plat.getByLabel("Código").fill(totpCode(secret));
  await plat.getByRole("button", { name: "Confirmar" }).click();
  await plat.waitForURL(`${BASE}/plataforma`, { timeout: 30000 });
  ok("admin com MFA verificado entra no painel da plataforma", plat.url() === `${BASE}/plataforma`);
  // Nova entrada: pede só o código (fator já cadastrado).
  const plat2 = await login("/entrar", platformEmail, platformPw);
  await plat2.waitForURL(`${BASE}/plataforma-verificacao`, { timeout: 30000 });
  ok("nova entrada pede o código (sem novo QR)", await visible(plat2.getByText("Digite o código de 6 dígitos")));
  const res2 = await plat2.goto(`${BASE}/plataforma/nova`);
  ok("sem o código, /plataforma/nova também manda para a verificação", plat2.url() === `${BASE}/plataforma-verificacao`, String(res2?.status()));
  await plat2.context().close();
  const table = plat.getByRole("table");
  ok("lista mostra a conta do seed", await visible(table.getByRole("link", { name: "Studio Exemplo (fictício)" })));
  const text = await plat.locator("main").innerText();
  ok("nenhum dado de aluno na lista", !/Camila|aluno\.seed|Ana Duarte|Diego/.test(text));
  await plat.screenshot({ path: `${OUT}/plataforma-01-contas.png`, fullPage: true });

  // Criar conta → link de convite (copiar / WhatsApp), sem e-mail.
  await plat.getByRole("link", { name: "Nova conta de personal" }).click();
  await plat.getByLabel("Nome do negócio").fill(`E2E Studio ${RUN}`);
  await plat.getByLabel("Nome do personal").fill("Paula E2E");
  await plat.getByLabel("E-mail do personal").fill(newEmail);
  await plat.getByLabel("Limite de alunos").fill("40");
  await plat.getByRole("button", { name: "Criar conta" }).click();
  const linkInput = plat.getByRole("textbox", { name: "Link para o personal criar a senha" });
  ok("conta criada com link de convite", (await visible(linkInput)) && /\/auth\/confirm\?token_hash=[^&]+&type=invite&next=\/convite$/.test(await linkInput.inputValue()));
  ok("botão do WhatsApp com mensagem pronta", /^https:\/\/wa\.me\/\?text=/.test((await plat.getByRole("link", { name: "Abrir no WhatsApp" }).getAttribute("href")) ?? ""));

  // Conta do seed: em atraso → banner no painel do personal.
  await plat.goto(`${BASE}/plataforma`);
  await table.getByRole("link", { name: "Studio Exemplo (fictício)" }).click();
  await plat.getByRole("heading", { level: 1, name: "Studio Exemplo (fictício)" }).waitFor();
  await plat.getByLabel("Assinatura", { exact: true }).selectOption("past_due");
  await plat.getByRole("button", { name: "Salvar situação" }).click();
  ok("situação salva (auditada)", (await toast(plat, "Situação atualizada.")) && (await visible(plat.getByText("Situação alterada"))));
  await plat.screenshot({ path: `${OUT}/plataforma-02-conta.png`, fullPage: true });

  await owner.goto(`${BASE}/`);
  ok("personal em tolerância vê o banner com os dias", await visible(owner.getByText(/Sua assinatura está em atraso\. Regularize em até 10 dias/)));

  // Depois da tolerância: somente leitura (o banco recusa), Regularizar com contato.
  await setSeedSubscription(admin, "past_due", 11);
  await owner.reload();
  ok("banner de somente leitura", await visible(owner.getByText(/Sua conta está em modo somente leitura/)));
  await owner.getByRole("link", { name: "Regularizar assinatura" }).first().click();
  await owner.waitForURL(`${BASE}/regularizar`);
  ok("tela Regularizar assinatura", await visible(owner.getByRole("heading", { level: 1, name: "Regularizar assinatura" })));
  await owner.screenshot({ path: `${OUT}/plataforma-03-regularizar.png`, fullPage: true });

  // Aluno da conta limitada (375 px): mensagem com o nome de quem acompanha, sem iniciar treino.
  const aluna = await login("/aluno/entrar", "aluno.seed@example.com", PW, { width: 375, height: 812 });
  await waitLoggedIn(aluna, `${BASE}/aluno`);
  ok("aluno vê 'acesso temporariamente limitado' com o nome", await visible(aluna.getByText("Seu acesso está temporariamente limitado. Fale com Caio.")));
  ok("sem 'Iniciar treino' nem o botão fixo 'Começar treino'", (await aluna.getByRole("button", { name: /Iniciar treino|Começar treino/ }).count()) === 0);
  ok("aluno: sem rolagem horizontal", await aluna.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await aluna.screenshot({ path: `${OUT}/plataforma-04-aluno-limitado.png`, fullPage: true });

  ok("sem erro de página", [...owner.errors, ...plat.errors, ...aluna.errors].length === 0, [...owner.errors, ...plat.errors, ...aluna.errors].join(" | "));
} catch (e) {
  ok("roteiro terminou", false, e.message);
} finally {
  await setSeedSubscription(admin, "active").catch(() => {});
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const created = users.users.find((x) => x.email === newEmail);
  if (created) {
    const { data: prof } = await admin.from("profiles").select("organization_id").eq("id", created.id).maybeSingle();
    if (prof) await admin.from("organizations").delete().eq("id", prof.organization_id);
    await admin.auth.admin.deleteUser(created.id);
  }
  if (platformUserId) await admin.auth.admin.deleteUser(platformUserId); // a linha da lista sai em cascata
  await browser.close();
}
process.exit(fails ? 1 : 0);
