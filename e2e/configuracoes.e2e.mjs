import "./_guard.mjs";
import { waitLoggedIn } from "./_login.mjs";
import { makePng, seedIds } from "./_fixtures.mjs";
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

// Configurações do personal (desktop) + marca no app do aluno (375 px). Dados próprios: nome/logo/WhatsApp do negócio
// e a senha do owner do seed voltam ao original no fim (a senha pela secret key, mesmo se o roteiro falhar).
const RUN = Date.now().toString(36);
const { org, owner: ownerId } = await seedIds(admin);
const { data: before } = await admin.from("organizations").select("name, logo_path, contact_whatsapp").eq("id", org).single();
const NAME = `Studio E2E ${RUN}`;
const TEMP_PW = `Temp-${RUN}-senha-segura`;

async function login(path, email, password, viewport) {
  const mobile = viewport.width < 500;
  const page = await (await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile })).newPage();
  page.errors = []; page.on("pageerror", (e) => page.errors.push(e.message));
  await page.goto(`${BASE}${path}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await waitLoggedIn(page, `${BASE}${path.startsWith("/aluno") ? "/aluno" : "/"}`);
  return page;
}

try {
  const p = await login("/entrar", "owner.seed@example.com", PW, { width: 1440, height: 900 });
  ok("Configurações sem 'Em breve' no menu", (await p.locator('nav[aria-label="Menu principal"] a[href="/configuracoes"]').count()) === 1);
  ok("Suporte sem 'Em breve' no menu", (await p.locator('nav[aria-label="Menu principal"] a[href="/suporte"]').count()) === 1);
  await p.locator('nav[aria-label="Menu principal"] a[href="/configuracoes"]').click();
  await p.waitForURL(`${BASE}/configuracoes`);
  await p.getByRole("heading", { level: 1, name: "Configurações" }).waitFor();

  // Negócio: nome, logo (reduzido no navegador) e WhatsApp.
  const biz = p.locator("section", { has: p.getByRole("heading", { name: "Seu negócio" }) });
  await biz.getByLabel("Nome do negócio").fill(NAME);
  await biz.locator('input[type="file"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: makePng(300, 200) });
  ok("prévia do logo", await visible(biz.getByRole("img", { name: "Prévia: Logo" })));
  await biz.getByLabel("WhatsApp de contato").fill("41999010287");
  await biz.getByRole("button", { name: "Salvar negócio" }).click();
  ok("negócio salvo", await toast(p, "Dados do negócio salvos."));
  const { data: after } = await admin.from("organizations").select("name, logo_path, contact_whatsapp").eq("id", org).single();
  ok("banco: nome, logo na pasta da org e WhatsApp em E.164", after.name === NAME && new RegExp(`^${org}/logo-[0-9a-f-]{36}\\.(webp|jpg)$`).test(after.logo_path ?? "") && after.contact_whatsapp === "+5541999010287", JSON.stringify(after));

  // Plano e assinatura (só leitura).
  ok("plano e vagas visíveis", (await visible(p.getByText("Vagas de aluno"))) && (await visible(p.getByText(/\d+ de \d+ em uso/))));

  // Exportação: sem saúde por padrão; com opt-in, cabeçalho de saúde.
  const plain = await p.request.get(`${BASE}/configuracoes/exportar?tipo=students`);
  const plainText = await plain.text();
  ok("exportar alunos: CSV sem dados de saúde", plain.ok() && /text\/csv/.test(plain.headers()["content-type"] ?? "") && !/saúde|Observações/.test(plainText.split("\r\n")[0]));
  const sess = await p.request.get(`${BASE}/configuracoes/exportar?tipo=sessions`);
  ok("exportar histórico de treinos: CSV sem dor/comentário", sess.ok() && !/Dor|Comentário/.test((await sess.text()).split("\r\n")[0]));
  await p.getByLabel("Incluir ficha de saúde").check();
  ok("aviso claro ao marcar a ficha de saúde", await visible(p.getByText(/vai conter dados de saúde dos alunos/)));
  const health = await p.request.get(`${BASE}/configuracoes/exportar?tipo=students&saude=1`);
  ok("com o opt-in: coluna de saúde", (await health.text()).split("\r\n")[0].includes("Grupos especiais (saúde)"));

  // Senha: troca e volta (a volta também é garantida no finally).
  await p.getByLabel("Nova senha", { exact: true }).fill(TEMP_PW);
  await p.getByLabel("Confirme a nova senha").fill(TEMP_PW);
  await p.getByRole("button", { name: "Alterar senha" }).click();
  ok("senha alterada", await toast(p, "Senha alterada."));
  await p.screenshot({ path: `${OUT}/configuracoes-01.png`, fullPage: true });

  // Professor da equipe não exporta.
  const prof = await login("/entrar", "trainer2.seed@example.com", PW, { width: 1440, height: 900 });
  ok("professor não exporta a conta", (await prof.request.get(`${BASE}/configuracoes/exportar?tipo=students`)).status() === 403);

  // App do aluno: logo e nome do negócio no topo.
  const aluna = await login("/aluno/entrar", "aluno.seed@example.com", PW, { width: 375, height: 812 });
  const header = aluna.locator("header").first();
  ok("app do aluno mostra o nome do negócio", await visible(header.getByText(NAME)));
  ok("app do aluno mostra o logo (URL assinada)", /\/storage\/v1\/object\/sign\/org-branding\//.test((await header.locator("img").first().getAttribute("src")) ?? ""));
  ok("aluno: sem rolagem horizontal", await aluna.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await aluna.screenshot({ path: `${OUT}/configuracoes-02-aluno.png` });
  ok("sem erro de página", [...p.errors, ...prof.errors, ...aluna.errors].length === 0, [...p.errors, ...prof.errors, ...aluna.errors].join(" | "));
} catch (e) {
  ok("roteiro terminou", false, e.message);
} finally {
  await admin.auth.admin.updateUserById(ownerId, { password: PW });
  await admin.from("organizations").update({ name: before.name, logo_path: before.logo_path, contact_whatsapp: before.contact_whatsapp }).eq("id", org);
  const { data: files } = await admin.storage.from("org-branding").list(org, { limit: 100 });
  const mine = (files ?? []).map((f) => `${org}/${f.name}`).filter((f) => f.includes("/logo-") && f !== before.logo_path);
  if (mine.length) await admin.storage.from("org-branding").remove(mine);
  await browser.close();
}
process.exit(fails ? 1 : 0);
