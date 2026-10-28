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

// Celular de 375 px (iPhone SE/mini): toque, tela estreita.
async function phone(email) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
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

// --- Login: links cruzados "Sou professor" / "Sou aluno" ------------------------------
{
  const anon = await (await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })).newPage();
  await anon.goto(`${BASE}/aluno/entrar`);
  ok("login do aluno leva ao painel do treinador", (await anon.getByRole("link", { name: "Entrar no painel do treinador" }).getAttribute("href")) === "/entrar");
  await anon.goto(`${BASE}/entrar`);
  ok("login do professor leva ao app do aluno", (await anon.getByRole("link", { name: "Entrar no app do aluno" }).getAttribute("href")) === "/aluno/entrar");
  await anon.context().close();
}

// --- Hoje ---------------------------------------------------------------------
const page = await phone("aluno.seed@example.com");
ok("login do aluno cai no app (/aluno)", page.url() === `${BASE}/aluno`);
ok("Hoje: plano ativo e divisão sugerida", (await waitText(page, "Hipertrofia ABC")) && (await waitText(page, "Sugerido para hoje")));
ok("nenhum alerta de contraindicação no app do aluno", !/Evitar|Cautela|contraindica/i.test(await page.locator("main").innerText()));
ok("Hoje: saudação pela hora de SP", /^(Bom dia|Boa tarde|Boa noite), Camila!$/.test((await page.getByRole("heading", { level: 1 }).innerText()).trim()));
ok("Hoje: constância sem cobrança (nenhum treino no mês)", await waitText(page, "Seu primeiro treino do mês está esperando por você."));
ok("Hoje: recado do professor", (await waitText(page, "Recado do seu professor")) && (await waitText(page, "Semana de deload: mantenha as cargas e capriche na execução.")));
ok("Hoje: card do professor com horário e atalho", (await waitText(page, "Caio Exemplo")) && (await waitText(page, "Atendimento: Seg a sex, 7h às 12h")) && (await page.getByRole("link", { name: "Mandar mensagem" }).getAttribute("href")) === "/aluno/chat");

// Barra de 4 abas, navegável por teclado, com a aba atual marcada.
const tabs = page.getByRole("navigation", { name: "Navegação do app" }).getByRole("link");
ok("barra com 4 abas", (await tabs.allInnerTexts()).map((x) => x.trim()).join("|") === "Hoje|Histórico|Chat|Perfil");
ok("aba atual marcada (aria-current)", (await tabs.first().getAttribute("aria-current")) === "page");
const tabBox = await tabs.nth(3).boundingBox();
ok("área de toque das abas ≥ 44 px", tabBox && tabBox.height >= 44 && tabBox.width >= 44, JSON.stringify(tabBox));
await tabs.nth(3).focus();
await page.keyboard.press("Enter");
await page.waitForURL(`${BASE}/aluno/perfil`, { timeout: 15000 });
ok("Perfil pelo teclado: nome, estúdio, professor, horário e Sair", (await waitText(page, "Camila Freitas")) && (await waitText(page, "Studio Exemplo (fictício)")) && (await waitText(page, "Caio Exemplo")) && (await waitText(page, "Seg a sex, 7h às 12h")) && (await page.getByRole("button", { name: "Sair da conta" }).count()) === 1);
ok("cabeçalho sem 'Sair' dentro do app (fica no Perfil)", (await page.locator("header").getByRole("button", { name: /Sair/ }).count()) === 0);
await page.screenshot({ path: `${OUT}/f3-01b-perfil.png`, fullPage: true });

// Chat: nome do professor no topo, aviso de emergência recolhível, barra some com o teclado.
await tabs.nth(2).click();
await page.waitForURL(`${BASE}/aluno/chat`, { timeout: 15000 });
ok("chat: nome do professor no topo", (await page.getByRole("heading", { level: 1 }).innerText()).trim() === "Caio Exemplo");
const notice = page.getByRole("button", { name: /Não é canal de emergência/ });
ok("chat: primeiro acesso, aviso começa aberto", (await notice.getAttribute("aria-expanded")) === "true" && (await waitText(page, "Sua conversa é vista pelo seu professor")));
await page.reload();
await settle(page);
ok("chat: depois do primeiro acesso, aviso começa recolhido em uma linha", (await notice.getAttribute("aria-expanded")) === "false" && (await waitText(page, "Não é canal de emergência · ligue 192")) && !(await page.getByText("Sua conversa é vista pelo seu professor").isVisible()) && (await notice.boundingBox()).height <= 48);
await notice.click();
ok("chat: aviso expandido mostra o texto completo e quem vê a conversa", (await notice.getAttribute("aria-expanded")) === "true" && (await waitText(page, "Não é canal de emergência. Dor forte, falta de ar ou dor no peito: ligue 192.")) && (await page.getByText("Sua conversa é vista pelo seu professor").isVisible()));
await notice.click();
ok("chat: aviso recolhido mantém a linha de emergência", (await notice.getAttribute("aria-expanded")) === "false" && (await waitText(page, "Não é canal de emergência · ligue 192")) && !(await page.getByText("Sua conversa é vista pelo seu professor").isVisible()));
await page.reload();
await settle(page);
ok("chat: aviso continua recolhido neste aparelho", (await page.getByRole("button", { name: /Não é canal de emergência/ }).getAttribute("aria-expanded")) === "false");
await page.getByRole("button", { name: /Não é canal de emergência/ }).click();
await page.reload();
await settle(page);
ok("chat: aviso aberto pelo aluno continua aberto neste aparelho", (await page.getByRole("button", { name: /Não é canal de emergência/ }).getAttribute("aria-expanded")) === "true");
await page.getByRole("textbox", { name: "Mensagem" }).focus();
ok("teclado aberto: a barra de abas some", await page.getByRole("navigation", { name: "Navegação do app" }).waitFor({ state: "detached", timeout: 5000 }).then(() => true, () => false));
await page.getByRole("textbox", { name: "Mensagem" }).blur();
ok("teclado fechado: a barra volta", await page.getByRole("navigation", { name: "Navegação do app" }).waitFor({ timeout: 5000 }).then(() => true, () => false));
await tabs.nth(0).click();
await page.waitForURL(`${BASE}/aluno`, { timeout: 15000 });
await settle(page);
const sw = await page.evaluate(() => document.documentElement.scrollWidth);
ok("sem rolagem horizontal no celular", sw <= 375, String(sw));
ok("pausa padronizada (até 90 s em segundos)", (await page.getByText(/· 60 s$/).count()) > 0 && (await page.getByText(/· 1 min$/).count()) === 0);
await page.screenshot({ path: `${OUT}/f3-01-hoje.png`, fullPage: true });

// --- Execução: série, descanso, fila sem internet, concluir, finalizar -----------------
await page.getByRole("button", { name: "Iniciar treino" }).first().click();
await page.waitForURL(/\/aluno\/treino\/[0-9a-f-]+/, { timeout: 20000 });
const sessionId = page.url().split("/treino/")[1].split("?")[0];
await page.getByRole("button", { name: "Série 1: Feita" }).first().waitFor({ timeout: 15000 });
ok("sem pergunta de dor no primeiro treino", (await page.getByRole("dialog").count()) === 0);
await page.screenshot({ path: `${OUT}/f3-02-execucao.png`, fullPage: true });

// Modo foco: um exercício por vez, com a faixa de progresso para pular entre eles.
ok("modo foco: um exercício na tela", (await page.locator("section[id^='ex-']").count()) === 1);
const strip = page.getByRole("navigation", { name: "Exercícios do treino" });
ok("faixa de progresso com todos os exercícios", (await strip.getByRole("button").count()) === 6);
await strip.getByRole("button", { name: /^Exercício 3:/ }).click();
ok("toque na faixa troca o exercício em foco", await waitText(page, "3 de 6"));
await page.getByRole("button", { name: "Anterior" }).click();
await page.getByRole("button", { name: "Anterior" }).click();
ok("'Anterior' volta ao primeiro", await waitText(page, "1 de 6"));
const thumbs = await page.getByRole("button", { name: /^Ver vídeo:/ }).count();
if (thumbs > 0) {
  await page.getByRole("button", { name: /^Ver vídeo:/ }).first().click();
  ok("miniatura abre o vídeo", await page.getByRole("dialog").waitFor({ timeout: 5000 }).then(() => true, () => false));
  await page.keyboard.press("Escape");
  // Enquanto a janela fecha (animação), o resto da página fica aria-hidden e o getByRole abaixo não acha nada.
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
}
const first = page.locator("section[id^='ex-']");
ok("sem alerta nem orientação: dor só pelo link discreto", (await first.getByRole("button", { name: "Sentiu algum desconforto?" }).count()) === 1 && (await first.getByRole("radio", { name: "Dor 0 de 10" }).count()) === 0);
await first.getByLabel(/^Carga/).first().fill("42,5");
await first.getByRole("button", { name: "Série 1: Feita" }).click();
ok("descanso começa depois da série", await page.getByRole("timer").waitFor({ timeout: 5000 }).then(() => true, () => false));
await page.screenshot({ path: `${OUT}/f3-03-descanso.png` });
await page.getByRole("button", { name: "Pular" }).click();
ok("série salva", await waitText(page, "Tudo salvo"));

await page.ctx.setOffline(true);
await first.getByLabel(/^Feito/).first().fill("9"); // só a série atual tem campos
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

ok("séries feitas ficam compactas com ✓", await waitText(page, "Série 1 · 10 reps · 42,5 kg"));
await first.getByRole("button", { name: "Concluir exercício" }).click(); // sem alerta nem orientação: dor opcional
ok("concluir avança sozinho para o próximo", (await waitText(page, /^1\/\d+ · /)) && (await waitText(page, "2 de 6")));
await page.screenshot({ path: `${OUT}/f3-02b-foco.png`, fullPage: true });
await page.getByRole("button", { name: "Finalizar treino" }).click();
await page.getByRole("radio", { name: "Esforço 7 de 10" }).click();
await page.getByRole("button", { name: "Salvar e finalizar" }).click();
await page.waitForURL(`${BASE}/aluno/treino/${sessionId}/concluido`, { timeout: 20000 });
await settle(page);
ok("fim de treino: resumo com exercícios e séries", (await waitText(page, "Treino concluído!")) && (await waitText(page, /\d+ exercícios? · \d+ séries?/)));
ok("fim de treino: constância em destaque", await waitText(page, "1 treino este mês"));
ok("fim de treino: primeira vez não é recorde", (await page.getByText("Recorde pessoal de carga").count()) === 0);
ok("fim de treino: sem comentário, sem aviso de comentário", (await page.getByText("Seu professor vai ver o seu comentário.").count()) === 0);
await page.getByRole("radio", { name: "Nota 4 de 5" }).click();
ok("nota: confirmação na tela", await waitText(page, "Obrigado! Nota registrada."));
const { data: rated } = await admin.from("workout_sessions").select("student_rating").eq("id", sessionId).single();
ok("nota gravada no banco (rate_workout_session)", rated?.student_rating === 4, JSON.stringify(rated));
ok("nota fora da URL", page.url() === `${BASE}/aluno/treino/${sessionId}/concluido`);
await page.screenshot({ path: `${OUT}/f3-04b-concluido.png`, fullPage: true });
await page.goto(`${BASE}/aluno/treino/${sessionId}`);
await page.waitForURL(`${BASE}/aluno/treino/${sessionId}/concluido`, { timeout: 15000 });
ok("sessão concluída reaberta vai para o resumo", await waitText(page, "Treino concluído!"));
await page.getByRole("link", { name: "Voltar para o Hoje" }).click();
await page.waitForURL(`${BASE}/aluno`, { timeout: 20000 });
await settle(page);
ok("treino finalizado volta para o Hoje", await waitText(page, "1 sessão concluída"));
ok("Hoje: constância atualizada", await waitText(page, "1 treino este mês"));
ok("rodízio: depois da A, sugere a B", await waitText(page, "Costas e bíceps"));

// --- Orientação de cuidado: dor obrigatória na divisão C -------------------------------
await page.getByText("Pernas").first().click();
await page.getByRole("button", { name: "Iniciar treino C" }).click();
await page.waitForURL(/\/aluno\/treino\//, { timeout: 20000 });
const agacho = page.locator("section[id^='ex-']");
await agacho.getByText("Orientação do seu personal").waitFor({ timeout: 15000 });
ok("orientação de cuidado aparece (ícone neutro, sem nível)", (await agacho.innerText()).includes("Coluna neutra") && !/Evitar|Cautela/.test(await agacho.innerText()));
const concluir = agacho.getByRole("button", { name: "Concluir exercício" });
ok("com orientação de cuidado, concluir exige a dor", await concluir.isDisabled());
await agacho.getByRole("radio", { name: "Dor 7 de 10" }).click();
ok("dor acima de 5: orientação de parar", await waitText(page, "Dor acima de 5"));
await page.screenshot({ path: `${OUT}/f3-05-dor.png`, fullPage: true });
await concluir.click();
await page.getByRole("button", { name: "Finalizar treino" }).click();
await page.getByLabel("Comentário para o seu personal (opcional)").fill("Senti o treino mais pesado hoje.");
await page.getByRole("button", { name: "Salvar e finalizar" }).click();
await page.waitForURL(/\/aluno\/treino\/[0-9a-f-]+\/concluido$/, { timeout: 20000 });
ok("fim de treino com comentário: aviso de que o professor vai ver", await waitText(page, "Seu professor vai ver o seu comentário."));
ok("comentário fora da URL e do título", !page.url().includes("pesado") && !(await page.title()).includes("pesado"));
// Resposta do professor ao 1º treino (a tela do professor chega na 3.3; aqui grava direto, como a RPC faria).
await admin.from("workout_sessions").update({ coach_reply: "Ótimo começo! Na próxima, suba 2 kg no supino.", coach_reply_at: new Date().toISOString() }).eq("id", sessionId);
await page.getByRole("link", { name: "Voltar para o Hoje" }).click();
await page.waitForURL(`${BASE}/aluno`, { timeout: 20000 });
await settle(page);
ok("Hoje: aviso da resposta do professor", await waitText(page, "Seu professor respondeu sobre o treino de hoje."));

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
ok("histórico mostra a resposta do professor", (await waitText(page, "Resposta do seu professor")) && (await waitText(page, "Ótimo começo! Na próxima, suba 2 kg no supino.")));
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
