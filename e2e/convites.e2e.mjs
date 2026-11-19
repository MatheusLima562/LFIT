import "./_guard.mjs";
import { waitLoggedIn } from "./_login.mjs";
import { seedIds } from "./_fixtures.mjs";
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
const visible = (loc, timeout = 15000) => loc.first().waitFor({ timeout }).then(() => true, () => false);

// Convites (1.4): o personal convida um aluno em pré-cadastro (criado aqui, sem login), copia o link / abre o WhatsApp,
// o aluno abre o link no celular (375 px), vê o negócio, cria a senha e o status vira "Aceito". Dados próprios: o aluno
// e a conta criada são apagados no fim.
const RUN = Date.now().toString(36);
const { org } = await seedIds(admin);
const NEW_PW = `Aluno-${randomUUID().slice(0, 12)}`;
const { data: created, error } = await admin.from("students").insert({
  organization_id: org, first_name: "Convite", last_name: `E2E ${RUN}`, email: `lfit-test-convite-${RUN}@example.com`,
  whatsapp_e164: "+5541999990000", enrollment_number: 900000 + Math.floor(Math.random() * 99999),
}).select("id").single();
if (error) throw new Error(error.message);
const studentId = created.id;

try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] })).newPage();
  page.errors = []; page.on("pageerror", (e) => page.errors.push(e.message));
  await page.goto(`${BASE}/entrar`);
  await page.getByLabel("E-mail").fill("owner.seed@example.com");
  await page.getByLabel("Senha", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Entrar" }).click();
  await waitLoggedIn(page, `${BASE}/`);

  await page.goto(`${BASE}/alunos/convites?aluno=${studentId}`);
  await page.getByRole("heading", { level: 1, name: "Convidar alunos" }).waitFor();
  const row = page.getByRole("listitem").filter({ hasText: `Convite E2E ${RUN}` });
  ok("aluno em pré-cadastro já marcado", await row.getByRole("checkbox").isChecked());
  ok("limite diário visível", await visible(page.getByText(/Convites restantes hoje: \d+ de 100/)));
  await page.getByLabel("Mensagem do WhatsApp").fill("Oi {nome}! Seu convite: {link}");
  await page.getByRole("button", { name: "Gerar convite" }).click();
  const wa = row.getByRole("link", { name: /Abrir no WhatsApp/ });
  ok("convite gerado com WhatsApp", await visible(wa));
  const href = (await wa.getAttribute("href")) ?? "";
  const text = decodeURIComponent(href.split("?text=")[1] ?? "");
  const link = text.match(/https?:\/\/\S+\/acesso\/[a-f0-9]{64}/)?.[0];
  ok("mensagem editada, com o nome e o link (wa.me para o número do aluno)", href.startsWith("https://wa.me/5541999990000?text=") && text.startsWith("Oi Convite! Seu convite: ") && Boolean(link), text);
  await row.getByRole("button", { name: "Copiar link" }).click();
  ok("copiar link", (await page.evaluate(() => navigator.clipboard.readText())) === link);
  ok("vale 7 dias", await visible(row.getByText(/Vale até \d{2}\/\d{2}\/\d{4}/)));
  await page.screenshot({ path: `${OUT}/convites-01.png`, fullPage: true });

  await page.goto(`${BASE}/alunos?q=${encodeURIComponent(`E2E ${RUN}`)}`);
  ok("lista: status 'Convite enviado'", await visible(page.getByRole("cell", { name: "Convite enviado" })));

  // Aluno abre o link no celular: nome do negócio, cria a senha.
  const phone = await (await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })).newPage();
  phone.errors = []; phone.on("pageerror", (e) => phone.errors.push(e.message));
  await phone.goto(link.replace(/^https?:\/\/[^/]+/, BASE));
  ok("tela do convite mostra o negócio", await visible(phone.getByText(/^Convite de Studio Exemplo/)));
  await phone.getByRole("button", { name: "Continuar" }).click();
  await phone.waitForURL(/\/convite/, { timeout: 30000 });
  await phone.getByLabel("Nova senha").fill(NEW_PW);
  await phone.getByLabel("Confirmar senha").fill(NEW_PW);
  await phone.getByRole("button", { name: "Salvar senha" }).click();
  await phone.waitForURL(/\/acesso\/(pronto|consentimento)/, { timeout: 30000 });
  ok("aluno criou a senha (primeiro acesso concluído)", /\/acesso\/pronto/.test(phone.url()), phone.url());
  ok("celular sem rolagem horizontal", await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await phone.screenshot({ path: `${OUT}/convites-02-aluno.png` });

  await page.reload();
  ok("lista: status 'Aceito'", await visible(page.getByRole("cell", { name: "Aceito" })));
  ok("o link não serve de novo", await (async () => {
    await phone.goto(link.replace(/^https?:\/\/[^/]+/, BASE));
    await phone.getByRole("button", { name: "Continuar" }).click();
    return visible(phone.getByText("Este link expirou ou já foi usado."));
  })());
  ok("sem erro de página", [...page.errors, ...phone.errors].length === 0, [...page.errors, ...phone.errors].join(" | "));
} catch (e) {
  ok("roteiro terminou", false, e.message);
} finally {
  const { data: s } = await admin.from("students").select("user_id").eq("id", studentId).single();
  await admin.from("students").delete().eq("id", studentId);
  if (s?.user_id) await admin.auth.admin.deleteUser(s.user_id);
  await browser.close();
}
process.exit(fails ? 1 : 0);
