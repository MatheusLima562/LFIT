import "./_guard.mjs";
// Senha descartável da conta de aluno criada durante o roteiro (gerada a cada execução).
const STUDENT_PW = `Aluno-${crypto.randomUUID()}`;
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
const settle = (p) => p.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => p.waitForLoadState("load"));
const lastToast = async (p) => { const t = p.locator("[data-sonner-toast]").last(); await t.waitFor({ timeout: 15000 }); return (await t.innerText()).trim(); };
async function login(ctx, email) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/entrar`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 20000 });
  return page;
}
const { data: org } = await admin.from("organizations").select("id").eq("slug", "studio-exemplo").single();
const pendingCount = async () => (await admin.from("pending_signups").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("status", "pending")).count;

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
const page = await login(ctx, "owner.seed@example.com");

// --- Item 1: visibilidade para o owner (declarado x confirmado) ---
const { data: activeIds } = await admin.from("students_with_status").select("id").eq("organization_id", org.id).in("effective_status", ["active", "blocked"]);
const { data: withGroups } = await admin.from("students").select("id, first_name, last_name, trainer_id, health_data_consent_at, health_consent_declared_at, student_groups(group_id)").eq("organization_id", org.id).not("health_consent_declared_at", "is", null).in("id", activeIds.map((r) => r.id));
console.log("candidatos:", withGroups.map((s) => `${s.first_name} ${s.last_name} titular=${!!s.health_data_consent_at}`).join(", "));
const { data: ownerProfile } = await admin.from("profiles").select("id").eq("organization_id", org.id).eq("role", "owner").single();
const hidden = withGroups.find((s) => !s.health_data_consent_at && s.trainer_id && s.trainer_id !== ownerProfile.id);
const visible = withGroups.find((s) => s.health_data_consent_at);
await page.goto(`${BASE}/alunos?q=${encodeURIComponent(hidden.first_name + " " + hidden.last_name)}`); await settle(page);
ok("owner NÃO vê grupos só declarados (aluno de outro professor)", (await page.locator("table tbody tr").first().locator("td:nth-child(8)").innerText()).trim() === "—");
await page.goto(`${BASE}/alunos?q=${encodeURIComponent(visible.first_name + " " + visible.last_name)}`); await settle(page);
ok("owner vê grupos confirmados pelo titular", (await page.locator("table tbody tr").first().locator("td:nth-child(8)").innerText()).includes("Dor"));

// editar o oculto: aviso e grupos preservados
await page.goto(`${BASE}/alunos?editar=${hidden.id}`); const dlg = page.getByRole("dialog"); await dlg.waitFor(); await page.waitForTimeout(300);
ok("modal mostra aviso de saúde aguardando o aluno", await dlg.getByText(/aguardam a confirmação de consentimento do próprio aluno/).isVisible());
await dlg.locator("form").evaluate((f) => f.scrollTo(0, 700)); await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/01-editar-saude-oculta.png` });
await dlg.getByLabel("Local de treino").fill("Studio Norte");
await dlg.getByRole("button", { name: "Salvar alterações" }).click();
await dlg.waitFor({ state: "detached", timeout: 20000 });
const { data: afterEdit } = await admin.from("students").select("training_location, student_groups(group_id)").eq("id", hidden.id).single();
ok("owner salva outros campos sem apagar grupos ocultos", afterEdit.training_location === "Studio Norte" && afterEdit.student_groups.length === hidden.student_groups.length);

// --- 1.4: página do owner ---
await page.goto(`${BASE}/alunos`); await settle(page);
ok("botão Cadastros públicos com contagem", (await page.getByRole("main").getByRole("link", { name: /Cadastros públicos/ }).innerText()).includes("3"));
await page.getByRole("main").getByRole("link", { name: /Cadastros públicos/ }).first().click();
await page.waitForURL(/cadastros-publicos/); await settle(page);
await page.screenshot({ path: `${OUT}/02-admin.png`, fullPage: true });
const url = await page.getByLabel("URL do link de cadastro").inputValue();
ok("URL do link exibida", /\/cadastro\/[a-f0-9]{64}$/.test(url));
// campo local de treino → obrigatório
await page.getByLabel("Local de treino", { exact: true }).click();
await page.getByRole("option", { name: "Obrigatório" }).click();
await page.getByRole("button", { name: "Salvar campos" }).click();
ok("configuração de campos salva", (await lastToast(page)).includes("Campos atualizados"));

// --- Formulário público (anônimo) ---
const pub = await (await browser.newContext({ viewport: { width: 430, height: 932 } })).newPage();
await pub.goto(url); await settle(pub);
ok("formulário público não expõe grupos especiais", !(await pub.content()).match(/Dor na Coluna|Dor no Joelho|Dor no Ombro/));
await pub.screenshot({ path: `${OUT}/03-publico.png`, fullPage: true });
await pub.getByRole("button", { name: "Enviar cadastro" }).click();
const errs = (await pub.locator("[data-slot=field-error]").allInnerTexts()).join(" | ");
ok("validação do público (inclui campo configurado como obrigatório)", (errs.match(/obrigatório/g) ?? []).length >= 4, errs);
await pub.getByLabel("Nome *", { exact: true }).fill("Olívia");
await pub.getByLabel("Sobrenome *").fill("Pública");
await pub.getByLabel("E-mail *").fill(`olivia.publica.${Date.now()}@example.com`);
await pub.getByLabel(/Local de treino/).fill("Online");
await pub.getByLabel(/condição de saúde/).fill("Condromalácia no joelho esquerdo.");
await pub.getByRole("button", { name: "Enviar cadastro" }).click();
ok("saúde exige consentimento do próprio aluno", (await pub.locator("[data-slot=field-error]").allInnerTexts()).join().includes("autorização"));
await pub.getByLabel(/Autorizo o registro/).check();
await pub.waitForFunction(() => document.querySelector('[name="cf-turnstile-response"]')?.value?.length > 0, null, { timeout: 30000 });
ok("Turnstile gerou token (chave de teste)", true);
const before = await pendingCount();
await pub.getByRole("button", { name: "Enviar cadastro" }).click();
await pub.getByText("Cadastro enviado!").waitFor({ timeout: 20000 });
ok("envio público cria pendente", (await pendingCount()) === before + 1);
await pub.screenshot({ path: `${OUT}/04-publico-enviado.png` });

// Honeypot: preenchido → "sucesso" mas nada gravado
const bot = await (await browser.newContext()).newPage();
await bot.goto(url); await settle(bot);
await bot.getByLabel("Nome *", { exact: true }).fill("Robô");
await bot.getByLabel("Sobrenome *").fill("Spam");
await bot.getByLabel("E-mail *").fill(`bot.${Date.now()}@example.com`);
await bot.getByLabel(/Local de treino/).fill("x");
await bot.locator("#website").fill("http://spam.example", { force: true });
await bot.waitForFunction(() => document.querySelector('[name="cf-turnstile-response"]')?.value?.length > 0, null, { timeout: 30000 });
const beforeBot = await pendingCount();
await bot.getByRole("button", { name: "Enviar cadastro" }).click();
await bot.getByText("Cadastro enviado!").waitFor({ timeout: 20000 });
ok("honeypot: bot vê sucesso, nada é gravado", (await pendingCount()) === beforeBot);

// Aprovação com classificação
await page.reload(); await settle(page);
ok("pendente novo listado com selo de saúde", await page.getByText("Olívia Pública").isVisible() && (await page.locator("li", { hasText: "Olívia Pública" }).innerText()).includes("Informou saúde"));
await page.locator("li", { hasText: "Olívia Pública" }).getByRole("button", { name: "Aprovar" }).click();
const adlg = page.getByRole("dialog"); await adlg.waitFor(); await page.waitForTimeout(300);
ok("diálogo mostra o texto de saúde e o consentimento do aluno", (await adlg.innerText()).includes("Condromalácia") && (await adlg.innerText()).includes("Consentimento dado pelo próprio aluno"));
await adlg.getByLabel("Professor responsável").click(); await page.getByRole("option", { name: "Bianca Exemplo" }).click();
await adlg.getByRole("combobox", { name: /Grupos especiais|Selecionar grupos/ }).click();
await page.getByRole("option", { name: "Dor no Joelho" }).click(); await page.keyboard.press("Escape");
await page.screenshot({ path: `${OUT}/05-aprovar.png` });
await adlg.getByRole("button", { name: "Aprovar" }).click();
ok("aprovação", (await lastToast(page)).includes("aprovado"));
const { data: olivia } = await admin.from("students").select("id, source, trainer_id, health_data_consent_at, student_groups(group_id)").ilike("first_name", "Olívia").single();
ok("aluno criado: source public_link, consentimento do titular, 1 grupo", olivia.source === "public_link" && !!olivia.health_data_consent_at && olivia.student_groups.length === 1);
const { data: scrub } = await admin.from("pending_signups").select("payload").eq("student_id", olivia.id).single();
ok("dados do pendente descartados após aprovar", JSON.stringify(scrub.payload) === "{}");

// Recusar Nina; aprovar Mário em lote
await page.reload(); await settle(page);
await page.locator("li", { hasText: "Nina Pendente" }).getByRole("button", { name: "Recusar" }).click();
await page.getByRole("alertdialog").getByRole("button", { name: "Recusar" }).click();
ok("recusa", (await lastToast(page)).includes("recusado"));
await page.reload(); await settle(page);
await page.getByRole("checkbox", { name: "Selecionar Mário Pendente" }).check();
await page.getByRole("button", { name: /Aprovar 1/ }).click();
ok("aprovação em lote", (await lastToast(page)).includes("aprovado"));

// Revogar o link
await page.reload(); await settle(page);
await page.getByRole("button", { name: /Gerar novo link/ }).click();
await page.getByRole("alertdialog").getByRole("button", { name: "Gerar novo link" }).click();
ok("novo link gerado", (await lastToast(page)).includes("revogado"));
await pub.goto(url); await settle(pub);
ok("link antigo mostra 'Link indisponível'", await pub.getByText("Link indisponível").isVisible());
await pub.screenshot({ path: `${OUT}/06-link-revogado.png` });
await page.reload(); await settle(page);
const newUrl = await page.getByLabel("URL do link de cadastro").inputValue();
await page.getByLabel("Link ativo").click(); await lastToast(page);
await pub.goto(newUrl); await settle(pub);
ok("link desativado mostra indisponível", await pub.getByText("Link indisponível").isVisible());
await page.getByLabel("Link ativo").click();

// --- Item 1: aluno confirma no primeiro acesso ---
await page.goto(`${BASE}/alunos?q=${encodeURIComponent(hidden.first_name + " " + hidden.last_name)}`); await settle(page);
const hname = (await page.locator("table tbody tr td:first-child p").first().innerText()).trim();
await page.getByRole("button", { name: `Ações para ${hname}` }).first().click();
await page.getByRole("menuitem", { name: "Copiar link de acesso" }).click(); await lastToast(page);
const access = await page.evaluate(() => navigator.clipboard.readText());
const sp = await (await browser.newContext({ viewport: { width: 430, height: 932 } })).newPage();
await sp.goto(access); await sp.getByRole("button", { name: "Continuar" }).click();
await sp.waitForURL(`${BASE}/convite`, { timeout: 20000 });
await sp.getByLabel("Nova senha").fill(STUDENT_PW); await sp.getByLabel("Confirmar senha").fill(STUDENT_PW);
await sp.getByRole("button", { name: "Salvar senha" }).click();
await sp.waitForURL(/\/acesso\/consentimento/, { timeout: 20000 }); await settle(sp);
ok("aluno vê pedido de confirmação com os grupos", (await sp.locator("ul[aria-label='Dados de saúde registrados']").innerText()).includes("Dor"));
await sp.screenshot({ path: `${OUT}/07-aluno-consentimento.png` });
await sp.getByRole("button", { name: "Autorizo", exact: true }).click();
await sp.waitForURL(/\/acesso\/pronto\?consentimento=aceito/, { timeout: 20000 });
await sp.screenshot({ path: `${OUT}/08-aluno-pronto.png` });
ok("confirmação registrada", !!(await admin.from("students").select("health_data_consent_at").eq("id", hidden.id).single()).data.health_data_consent_at);
await page.goto(`${BASE}/alunos?q=${encodeURIComponent(hidden.first_name + " " + hidden.last_name)}`); await settle(page);
ok("após a confirmação, o owner passa a ver os grupos", (await page.locator("table tbody tr").first().locator("td:nth-child(8)").innerText()).includes("Dor"));

// Trainer na página do owner
const tctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const tp = await login(tctx, "trainer2.seed@example.com");
await tp.goto(`${BASE}/alunos/cadastros-publicos`); await settle(tp);
ok("trainer: página restrita ao administrador", await tp.getByText("Somente o administrador").isVisible());
ok("trainer: sem botão Cadastros públicos em Meus alunos", await (async () => { await tp.goto(`${BASE}/alunos`); await settle(tp); return (await tp.getByRole("main").getByRole("link", { name: /Cadastros públicos/ }).count()) === 0; })());

// Escuro
const d = await (await browser.newContext({ colorScheme: "dark", viewport: { width: 1440, height: 900 } })).newPage();
await d.goto(newUrl); await settle(d); await d.screenshot({ path: `${OUT}/09-publico-escuro.png` });

await browser.close();
console.log(fails ? `\n${fails} falha(s)` : "\nTudo ok");
