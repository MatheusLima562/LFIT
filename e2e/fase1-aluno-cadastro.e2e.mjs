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
const settle = (p) => p.waitForLoadState("networkidle");
const toasts = async (p) => (await p.locator("[data-sonner-toast]").allInnerTexts()).map((s) => s.trim());
async function login(ctx, email) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/entrar`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 20000 });
  return page;
}
const NEW_GROUP = `Dor no Quadril ${String(Date.now()).slice(-4)}`;
const EMAIL = `joana.teste.${Date.now()}@example.com`;

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await login(ctx, "owner.seed@example.com");
const dlg = page.getByRole("dialog");

// Entrada pelo atalho do dashboard
await page.getByRole("link", { name: "Cadastrar aluno" }).click();
await page.waitForURL(/\/alunos\?novo=1/); await dlg.waitFor();
ok("atalho do dashboard abre o modal Novo aluno", await dlg.getByRole("heading", { name: "Novo aluno" }).isVisible());
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/01-novo-vazio.png` });

// Validação
await dlg.getByRole("button", { name: "Cadastrar aluno" }).click();
const errs = await dlg.locator("[data-slot=field-error]").allInnerTexts();
ok("obrigatórios validados no cliente", errs.filter((e) => e.includes("obrigatório")).length >= 3, errs.join(" | "));
await dlg.getByLabel("WhatsApp").fill("123");
await dlg.getByLabel("Data de nascimento").fill("31022000");
await dlg.getByRole("button", { name: "Cadastrar aluno" }).click();
const errs2 = (await dlg.locator("[data-slot=field-error]").allInnerTexts()).join(" | ");
ok("telefone inválido", errs2.includes("Número inválido"));
ok("data inexistente (31/02)", errs2.includes("Data inválida"), errs2);

// Preenchimento completo
await dlg.getByLabel("Nome *", { exact: true }).fill("Joana");
await dlg.getByLabel("Sobrenome *").fill("Teste Cadastro");
await dlg.getByLabel("E-mail *").fill(EMAIL);
await dlg.getByLabel("Data de nascimento").fill("");
await dlg.getByLabel("Data de nascimento").pressSequentially("15041990");
ok("máscara de data", (await dlg.getByLabel("Data de nascimento").inputValue()) === "15/04/1990");
await dlg.getByLabel("Sexo").click(); await page.getByRole("option", { name: "Feminino" }).click();
await dlg.getByLabel("WhatsApp").fill("");
await dlg.getByLabel("WhatsApp").pressSequentially("41999887766");
ok("máscara de WhatsApp BR", (await dlg.getByLabel("WhatsApp").inputValue()) === "(41) 99988-7766", await dlg.getByLabel("WhatsApp").inputValue());
await dlg.getByLabel("Professor responsável").click(); await page.getByRole("option", { name: "Bianca Exemplo" }).click();
// grupos: existente + criado na hora
await dlg.getByRole("combobox", { name: /Grupos especiais|Selecionar grupos/ }).click();
await page.getByRole("option", { name: "Dor na Coluna" }).click();
await page.getByPlaceholder("Buscar ou criar grupo…").fill(NEW_GROUP);
await page.getByRole("option", { name: `Criar “${NEW_GROUP}”` }).click();
await page.waitForTimeout(1500);
await page.keyboard.press("Escape");
const chips = await dlg.getByRole("list", { name: "Grupos especiais" }).locator("li").allInnerTexts();
ok("grupo existente + criado inline", chips.length === 2 && chips.some((c) => c.includes("Quadril")), chips.join(","));
await dlg.getByRole("button", { name: "Cadastrar aluno" }).click();
ok("consentimento exigido com grupos", (await dlg.locator("[data-slot=field-error]").allInnerTexts()).join().includes("consentimento"));
await dlg.getByLabel(/Declaro que obtive o consentimento/).check();
await dlg.getByLabel("Data de expiração do acesso").fill("31/12/2026");
await dlg.getByLabel("Local de treino").fill("Studio Centro");
await dlg.getByLabel("Observação").fill("Prefere treinar cedo.");
await dlg.getByLabel("Enviar anamnese").click();
await dlg.getByLabel("Modelo de anamnese").click(); await page.getByRole("option", { name: "Anamnese padrão" }).click();
await dlg.getByLabel("Bloquear acesso se inadimplente").click();
// Foto fictícia gerada no navegador (sem arquivo externo): PNG 64×64.
const photoB64 = await page.evaluate(() => {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d");
  x.fillStyle = "#6a8"; x.fillRect(0, 0, 64, 64);
  return c.toDataURL("image/png").split(",")[1];
});
await dlg.locator('input[type="file"]').setInputFiles({ name: "foto-teste.png", mimeType: "image/png", buffer: Buffer.from(photoB64, "base64") });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/02-novo-preenchido.png` });
await dlg.locator("form").evaluate((f) => f.scrollTo(0, f.scrollHeight));
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/03-novo-acesso.png` });
await dlg.getByRole("button", { name: "Cadastrar aluno" }).click();
await dlg.waitFor({ state: "detached", timeout: 30000 });
await page.waitForTimeout(800);
const tt = await toasts(page);
ok("cadastro concluído (toast)", tt.some((t) => t.includes("Aluno cadastrado")), tt.join(" / "));
ok("aviso: convite não enviado sem SMTP", tt.some((t) => t.includes("convite não pôde ser enviado")));

// Conferência no banco
const { data: st } = await admin.from("students").select("*, student_groups(group_id)").eq("email", EMAIL).single();
ok("E.164 salvo", st.whatsapp_e164 === "+5541999887766", st.whatsapp_e164);
ok("nascimento ISO", st.birth_date === "1990-04-15");
ok("expiração no fim do dia em SP", new Date(st.access_expires_at).toISOString() === "2027-01-01T02:59:59.000Z", st.access_expires_at);
ok("declaração do professor registrada (titular confirma depois)", !!st.health_consent_declared_at && !st.health_data_consent_at);
ok("2 grupos", st.student_groups.length === 2);
ok("bloqueio por inadimplência", st.block_if_overdue === true);
ok("foto na pasta do aluno", st.photo_path?.startsWith(`${st.organization_id}/${st.id}/`), st.photo_path);
const { count: anam } = await admin.from("anamnesis_requests").select("id", { count: "exact", head: true }).eq("student_id", st.id);
ok("anamnese solicitada", anam === 1);
const { data: logs } = await admin.from("audit_logs").select("action, diff").eq("entity_id", st.id);
ok("auditoria (created, anamnesis_requested, invite_sent)", ["student.created", "student.anamnesis_requested", "student.invite_sent"].every((a) => logs.some((l) => l.action === a)));
ok("auditoria sem texto da observação", !JSON.stringify(logs).includes("Prefere treinar"));

// Lista com foto
await page.goto(`${BASE}/alunos?q=Joana`); await settle(page);
const row = page.locator("table tbody tr").first();
ok("lista mostra a foto (URL assinada)", (await row.locator("img").getAttribute("src"))?.includes("token="));
const rowText = await row.innerText();
// Aluna da Bianca, sem confirmação do titular: o owner NÃO vê os grupos (regra LGPD da 1.4).
ok("lista: expiração visível e grupos ocultos ao owner (sem confirmação do titular)", !rowText.includes("Dor no Quadril") && rowText.includes("Expira em 31/12/2026"), rowText.replace(/\s+/g, " "));
await page.screenshot({ path: `${OUT}/04-lista-com-foto.png`, clip: { x: 250, y: 150, width: 1190, height: 200 } });

// Edição
await row.getByRole("link", { name: /Editar/ }).click();
await page.waitForURL(/editar=/); await dlg.waitFor(); await page.waitForTimeout(400);
ok("edição pré-preenchida", (await dlg.getByLabel("WhatsApp").inputValue()) === "(41) 99988-7766" && (await dlg.getByLabel("Data de nascimento").inputValue()) === "15/04/1990");
ok("edição pelo owner: aviso de dados de saúde ocultos", await dlg.getByText(/Dados de saúde ocultos|só o professor responsável/i).first().isVisible());
ok("convite desmarcado na edição", (await dlg.getByLabel("Enviar convite de acesso").getAttribute("aria-checked")) === "false");
await page.screenshot({ path: `${OUT}/05-editar.png` });
await dlg.getByLabel("Sobrenome *").fill("Teste Editada");
await dlg.getByRole("button", { name: "Remover foto" }).click();
await dlg.getByRole("button", { name: "Salvar alterações" }).click();
await dlg.waitFor({ state: "detached", timeout: 30000 });
const { data: st2 } = await admin.from("students").select("last_name, photo_path").eq("id", st.id).single();
ok("edição salva", st2.last_name === "Teste Editada");
ok("foto removida do aluno", st2.photo_path === null);
const { data: files } = await admin.storage.from("student-photos").list(`${st.organization_id}/${st.id}`);
ok("arquivo apagado do Storage", (files ?? []).length === 0, `${(files ?? []).length} arquivo(s)`);

// E-mail duplicado
await page.goto(`${BASE}/alunos?novo=1`); await dlg.waitFor();
await dlg.getByLabel("Nome *", { exact: true }).fill("Outra"); await dlg.getByLabel("Sobrenome *").fill("Pessoa");
await dlg.getByLabel("E-mail *").fill(EMAIL.toUpperCase());
await dlg.getByLabel("Enviar convite de acesso").click();
await dlg.getByRole("button", { name: "Cadastrar aluno" }).click();
await dlg.locator("[data-slot=field-error]").first().waitFor();
ok("e-mail duplicado no campo", (await dlg.locator("[data-slot=field-error]").allInnerTexts()).join().includes("Já existe um aluno com este e-mail"));

// Limite do plano
const { data: org } = await admin.from("organizations").select("id, student_limit").eq("slug", "studio-exemplo").single();
await admin.from("organizations").update({ student_limit: 29 }).eq("id", org.id);
await dlg.getByLabel("E-mail *").fill(`limite.${Date.now()}@example.com`);
await dlg.getByRole("button", { name: "Cadastrar aluno" }).click();
await dlg.getByText("Limite de alunos do plano atingido").waitFor({ timeout: 15000 });
ok("limite do plano: mensagem + CTA", await dlg.getByRole("button", { name: /Fazer upgrade/ }).isVisible());
await page.screenshot({ path: `${OUT}/06-limite.png` });
await admin.from("organizations").update({ student_limit: org.student_limit }).eq("id", org.id);
await dlg.getByRole("button", { name: "Cancelar" }).click();

// Exportação sem/com dados de saúde
const exp = async (qs) => { const r = await page.request.get(`${BASE}/alunos/exportar?${qs}`); return { status: r.status(), head: (await r.text()).split("\r\n")[0] }; };
const e1 = await exp("format=csv"); ok("exportação padrão sem grupos", e1.status === 200 && !e1.head.includes("Grupos especiais"), e1.head.slice(0, 60));
const e2 = await exp("format=csv&saude=1"); ok("exportação com opt-in inclui grupos", e2.status === 200 && e2.head.includes("Grupos especiais"));
const { data: g } = await admin.from("special_groups").select("id").eq("organization_id", org.id).eq("name", "Dor na Coluna").single();
const e3 = await exp(`format=csv&grupo=${g.id}`); ok("filtro de grupo sem opt-in é recusado", e3.status === 400);
const e4 = await exp(`format=csv&grupo=${g.id}&saude=1`); ok("filtro de grupo com opt-in exporta", e4.status === 200);
await page.goto(`${BASE}/alunos`); await settle(page);
await page.getByRole("button", { name: "Exportar" }).click(); await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/07-menu-exportar.png`, clip: { x: 1000, y: 150, width: 440, height: 330 } });
await page.getByRole("menuitem", { name: /Excel \(XLSX\)\s*\+ grupos/ }).click();
await page.getByRole("alertdialog").waitFor(); await page.waitForTimeout(300);
ok("confirmação LGPD antes de exportar saúde", (await page.getByRole("alertdialog").innerText()).includes("dados sensíveis"));
await page.screenshot({ path: `${OUT}/08-confirma-saude.png` });
await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();

// Escuro + mobile do modal
const dctx = await browser.newContext({ colorScheme: "dark", viewport: { width: 1440, height: 900 } });
await dctx.addCookies(await ctx.cookies());
const dp = await dctx.newPage(); await dp.goto(`${BASE}/alunos?novo=1`); await dp.getByRole("dialog").waitFor(); await dp.waitForTimeout(500);
await dp.screenshot({ path: `${OUT}/09-novo-escuro.png` });
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await mctx.addCookies(await ctx.cookies());
const mp = await mctx.newPage(); await mp.goto(`${BASE}/alunos?novo=1`); await mp.getByRole("dialog").waitFor(); await mp.waitForTimeout(500);
await mp.screenshot({ path: `${OUT}/10-novo-mobile.png` });
ok("modal no mobile sem overflow", (await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);

// Trainer
const tctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const tp = await login(tctx, "trainer1.seed@example.com");
await tp.goto(`${BASE}/alunos?novo=1`); const tdlg = tp.getByRole("dialog"); await tdlg.waitFor();
ok("trainer: professor fixo", await tdlg.getByText("Você será o professor responsável.").isVisible());
const TEMAIL = `trainer.aluno.${Date.now()}@example.com`;
await tdlg.getByLabel("Nome *", { exact: true }).fill("Tadeu"); await tdlg.getByLabel("Sobrenome *").fill("Do Trainer");
await tdlg.getByLabel("E-mail *").fill(TEMAIL);
await tdlg.getByLabel("Enviar convite de acesso").click();
await tdlg.getByRole("button", { name: "Cadastrar aluno" }).click();
await tdlg.waitFor({ state: "detached", timeout: 30000 });
const { data: ts } = await admin.from("students").select("trainer_id, profiles!students_trainer_id_organization_id_fkey(full_name)").eq("email", TEMAIL).single();
ok("aluno do trainer atribuído a ele", ts.profiles?.full_name === "Bianca Exemplo");

await browser.close();
console.log(fails ? `\n${fails} falha(s)` : "\nTudo ok");
