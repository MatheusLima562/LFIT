import "./_guard.mjs";
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
const waitText = (p, text, timeout = 15000) => p.getByText(text).first().waitFor({ timeout }).then(() => true, () => false);

// Celular (iPhone 12/13/14): toque, tela estreita.
async function phone(email) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.errors = errors; page.ctx = ctx;
  await page.goto(`${BASE}/aluno/entrar`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(`${BASE}/aluno`, { timeout: 30000 });
  await settle(page);
  return page;
}
const studentId = async (email) => {
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const u = users.users.find((x) => x.email === email);
  return (await admin.from("students").select("id").eq("user_id", u.id).single()).data.id;
};
const camila = await studentId("aluno.seed@example.com");

// --- Hoje ---------------------------------------------------------------------
const page = await phone("aluno.seed@example.com");
ok("login do aluno cai no app (/aluno)", page.url() === `${BASE}/aluno`);
ok("Hoje: plano ativo e divisão sugerida", (await waitText(page, "Hipertrofia ABC")) && (await waitText(page, "Sugerido para hoje")));
ok("nenhum alerta de contraindicação no app do aluno", !/Evitar|Cautela|contraindica/i.test(await page.locator("main").innerText()));
const sw = await page.evaluate(() => document.documentElement.scrollWidth);
ok("sem rolagem horizontal no celular", sw <= 390, String(sw));
await page.screenshot({ path: `${OUT}/f3-01-hoje.png`, fullPage: true });

// --- Execução: série, descanso, fila sem internet, concluir, finalizar -----------------
await page.getByRole("button", { name: "Iniciar treino" }).first().click();
await page.waitForURL(/\/aluno\/treino\/[0-9a-f-]+/, { timeout: 20000 });
const sessionId = page.url().split("/treino/")[1].split("?")[0];
await page.getByRole("button", { name: "Série 1: Feita" }).first().waitFor({ timeout: 15000 });
ok("sem pergunta de dor no primeiro treino", (await page.getByRole("dialog").count()) === 0);
await page.screenshot({ path: `${OUT}/f3-02-execucao.png`, fullPage: true });

const first = page.locator("li[id^='ex-']").first();
await first.getByLabel(/^Carga/).first().fill("42,5");
await first.getByRole("button", { name: "Série 1: Feita" }).click();
ok("descanso começa depois da série", await page.getByRole("timer").waitFor({ timeout: 5000 }).then(() => true, () => false));
await page.screenshot({ path: `${OUT}/f3-03-descanso.png` });
await page.getByRole("button", { name: "Pular" }).click();
ok("série salva", await waitText(page, "Tudo salvo"));

await page.ctx.setOffline(true);
await first.getByLabel(/^Feito/).nth(1).fill("9");
await first.getByRole("button", { name: "Série 2: Feita" }).click();
ok("sem internet: fica na fila local", await waitText(page, "Sem conexão — 1 registro pendente"));
await page.screenshot({ path: `${OUT}/f3-04-sem-conexao.png` });
await page.ctx.setOffline(false);
ok("conexão volta: fila enviada", await waitText(page, "Tudo salvo", 20000));
const { data: logs } = await admin
  .from("session_set_logs")
  .select("set_index, quantity_value, load_value, session_item_logs!inner(session_id)")
  .eq("session_item_logs.session_id", sessionId)
  .order("set_index");
ok("séries gravadas (inclusive a feita sem internet)", logs?.length === 2 && logs[0].load_value === 42.5 && logs[1].quantity_value === 9, JSON.stringify(logs));

await first.getByRole("button", { name: "Concluir exercício" }).click(); // sem orientação de cuidado: dor opcional
// Concluir fecha o card e abre o próximo exercício; o progresso no topo sobe.
ok("exercício concluído (dor opcional) e o próximo abre sozinho", await waitText(page, /^1\/\d+ · /));
await page.getByRole("button", { name: "Finalizar treino" }).click();
await page.getByRole("radio", { name: "Esforço 7 de 10" }).click();
await page.getByRole("button", { name: "Salvar e finalizar" }).click();
await page.waitForURL(`${BASE}/aluno`, { timeout: 20000 });
await settle(page);
ok("treino finalizado volta para o Hoje", await waitText(page, "1 sessão concluída"));
ok("rodízio: depois da A, sugere a B", await waitText(page, "Costas e bíceps"));

// --- Orientação de cuidado: dor obrigatória na divisão C -------------------------------
await page.getByText("Pernas").first().click();
await page.getByRole("button", { name: "Iniciar treino C" }).click();
await page.waitForURL(/\/aluno\/treino\//, { timeout: 20000 });
const agacho = page.locator("li[id^='ex-']").first();
await agacho.getByText("Orientação do seu personal").waitFor({ timeout: 15000 });
ok("orientação de cuidado aparece (ícone neutro, sem nível)", (await agacho.innerText()).includes("Coluna neutra") && !/Evitar|Cautela/.test(await agacho.innerText()));
const concluir = agacho.getByRole("button", { name: "Concluir exercício" });
ok("com orientação de cuidado, concluir exige a dor", await concluir.isDisabled());
await agacho.getByRole("radio", { name: "Dor 7 de 10" }).click();
ok("dor acima de 5: orientação de parar", await waitText(page, "Dor acima de 5"));
await page.screenshot({ path: `${OUT}/f3-05-dor.png`, fullPage: true });
await concluir.click();
await page.getByRole("button", { name: "Finalizar treino" }).click();
await page.getByRole("button", { name: "Salvar e finalizar" }).click();
await page.waitForURL(`${BASE}/aluno`, { timeout: 20000 });

// --- Próximo treino: pergunta de dor ------------------------------------------------
await page.getByRole("button", { name: "Iniciar treino" }).first().click();
await page.waitForURL(/\/aluno\/treino\//, { timeout: 20000 });
ok("próximo treino pergunta como ficou a dor", await waitText(page, "Como ficou a dor desde o último treino?"));
await page.screenshot({ path: `${OUT}/f3-06-pergunta-dor.png` });
await page.getByRole("button", { name: "Ainda incomoda" }).click();
ok("resposta gravada", await waitText(page, "Tudo salvo"));
const { data: alerts } = await admin.from("workout_sessions").select("pain_checkin").eq("student_id", camila).eq("pain_checkin", "ainda_incomoda");
ok("'Ainda incomoda' registrado para o aviso ao professor", alerts?.length === 1);

// --- Histórico --------------------------------------------------------------------
await page.getByRole("link", { name: "Histórico" }).click();
await page.waitForURL(`${BASE}/aluno/historico`);
await settle(page);
ok("histórico: 2 concluídos e 1 em andamento", (await page.getByText("Concluído", { exact: true }).count()) === 2 && (await page.getByText("Em andamento", { exact: true }).count()) === 1);
ok("histórico mostra o esforço", await waitText(page, "Esforço 7/10"));
await page.screenshot({ path: `${OUT}/f3-07-historico.png`, fullPage: true });

// --- Aluno no painel do treinador → volta para o app -----------------------------------
await page.goto(`${BASE}/alunos`);
await page.waitForURL(`${BASE}/aluno`, { timeout: 15000 }).catch(() => {});
ok("aluno não entra no painel do treinador (vai para o app)", page.url() === `${BASE}/aluno`);

// --- Acesso suspenso ----------------------------------------------------------------
const susp = await phone("aluno.suspenso.seed@example.com");
ok("acesso suspenso: tela própria, sem treino", (await waitText(susp, "Acesso suspenso")) && (await susp.getByRole("button", { name: "Iniciar treino" }).count()) === 0);
await susp.screenshot({ path: `${OUT}/f3-08-suspenso.png` });

// --- Consentimento pendente -----------------------------------------------------------
const cons = await phone("aluno.consentimento.seed@example.com");
ok("consentimento pendente antes do treino", await waitText(cons, "Seus dados de saúde"));
await cons.screenshot({ path: `${OUT}/f3-09-consentimento.png` });
await cons.getByRole("button", { name: "Autorizo", exact: true }).click();
await cons.waitForURL(`${BASE}/aluno`, { timeout: 20000 });
await settle(cons);
ok("depois de confirmar, segue no app (sem plano ainda)", await waitText(cons, "ainda não liberou um treino"));
const { data: diego } = await admin.from("students").select("health_data_consent_at").eq("user_id", (await admin.auth.admin.listUsers({ perPage: 1000 })).data.users.find((u) => u.email === "aluno.consentimento.seed@example.com").id).single();
ok("confirmação gravada", Boolean(diego?.health_data_consent_at));

// --- Staff em /aluno → painel -----------------------------------------------------------
const staffCtx = await browser.newContext();
const staff = await staffCtx.newPage();
await staff.goto(`${BASE}/entrar`);
await staff.getByLabel("E-mail").fill("owner.seed@example.com");
await staff.getByLabel("Senha", { exact: true }).fill(PW);
await staff.getByRole("button", { name: "Entrar" }).click();
await staff.waitForURL(`${BASE}/`, { timeout: 30000 });
await staff.goto(`${BASE}/aluno`);
await staff.waitForURL(`${BASE}/`, { timeout: 15000 }).catch(() => {});
ok("professor em /aluno volta para o painel", staff.url() === `${BASE}/`);

ok("sem erros de página", [page, susp, cons].every((p) => p.errors.length === 0), [page, susp, cons].flatMap((p) => p.errors).join(" | "));
await browser.close();
console.log(fails ? `${fails} falha(s)` : "tudo ok");
process.exit(fails ? 1 : 0);
