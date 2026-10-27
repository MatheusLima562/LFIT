import "./_guard.mjs";
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
const settle = (p) => p.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
const waitText = (p, text, timeout = 15000) => p.getByText(text).first().waitFor({ timeout }).then(() => true, () => false);
const waitGone = (p, text, timeout = 15000) => p.getByText(text).first().waitFor({ state: "detached", timeout }).then(() => true, () => false);
const until = async (fn, timeout = 15000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 250)); } return fn(); };

const RUN = `${Date.now()}`;
// Frase-canário única: o dono busca nos logs do Supabase para confirmar que o corpo das mensagens não aparece lá.
const CANARY = `canario-k212-${RUN}-${randomUUID().slice(0, 8)}`;
console.log(`Frase-canário desta execução: ${CANARY}`);

/** Tudo que o navegador registrou (console, URLs, títulos): o canário não pode aparecer em nada disso. */
function watch(page) {
  page.errors = []; page.consoleLines = []; page.urls = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  page.on("console", (m) => page.consoleLines.push(m.text()));
  page.on("framenavigated", (f) => f === page.mainFrame() && page.urls.push(f.url()));
}

// Celular de 375 px. O WebSocket do Realtime passa por um proxy do Playwright: dá para derrubá-lo e segurar a volta.
const ws = { sockets: [], blocked: false };
async function phone(email) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.ctx = ctx;
  watch(page);
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (socket) => {
    if (ws.blocked) { socket.close(); return; }
    socket.connectToServer();
    ws.sockets.push(socket);
  });
  await page.goto(`${BASE}/aluno/entrar`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(`${BASE}/aluno`, { timeout: 30000 });
  await settle(page);
  return page;
}
async function desk(email) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  watch(page);
  await page.goto(`${BASE}/entrar`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 30000 });
  await settle(page);
  return page;
}
const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
const userId = (email) => users.users.find((x) => x.email === email).id;
const CAMILA = (await admin.from("students").select("id").eq("user_id", userId("aluno.seed@example.com")).single()).data.id;
const dbCount = async (body) => (await admin.from("chat_messages").select("id", { count: "exact", head: true }).eq("student_id", CAMILA).eq("body", body)).count;
const sidebarChat = (p) => p.locator('nav[aria-label="Menu principal"] a[href="/chat"]');
const chatTab = (p) => p.getByRole("navigation", { name: "Navegação do app" }).locator('a[href="/aluno/chat"]');

try {
  // --- Aluno: barra com 4 abas (3.2), nenhum link morto ---------------------------------------------
  const sp = await phone("aluno.seed@example.com");
  const nav = sp.getByRole("navigation", { name: "Navegação do app" });
  const tabs = await nav.getByRole("link").allInnerTexts();
  ok("barra inferior com 4 abas: Hoje · Histórico · Chat · Perfil", JSON.stringify(tabs.map((x) => x.trim())) === JSON.stringify(["Hoje", "Histórico", "Chat", "Perfil"]), JSON.stringify(tabs));
  for (const href of await nav.getByRole("link").evaluateAll((as) => as.map((a) => a.getAttribute("href")))) {
    const res = await sp.request.get(`${BASE}${href}`);
    ok(`aba ${href} abre (sem link morto)`, res.status() === 200, String(res.status()));
  }
  ok("aluna leu tudo no seed: aba Chat sem selo", (await chatTab(sp).getAttribute("aria-label")) === null);

  await chatTab(sp).click();
  await sp.waitForURL(`${BASE}/aluno/chat`);
  await settle(sp);
  ok("aviso de emergência fixo", await waitText(sp, "Não é canal de emergência. Dor forte, falta de ar ou dor no peito: ligue 192."));
  ok("aviso de quem vê a conversa", await waitText(sp, "Sua conversa é vista pelo seu professor e pela coordenação do estúdio"));
  ok("mensagens do seed aparecem", (await waitText(sp, "Combinado, obrigada!")) && (await waitText(sp, "Pode sim, Camila.", 3000)));
  const input = sp.getByRole("textbox", { name: "Mensagem" });
  ok("campo com fonte de 16 px (sem zoom no iOS)", (await input.evaluate((el) => getComputedStyle(el).fontSize)) === "16px");
  ok("lista com aria-live", (await sp.locator('ol[aria-live="polite"]').count()) === 1);
  const inputBox = await input.boundingBox();
  const navBox = await nav.boundingBox();
  ok("campo de envio visível acima da barra inferior (100dvh)", inputBox && navBox && inputBox.y + inputBox.height <= navBox.y, `${inputBox?.y}+${inputBox?.height} × ${navBox?.y}`);
  ok("sem rolagem horizontal no celular", (await sp.evaluate(() => document.documentElement.scrollWidth)) <= 375);
  await sp.screenshot({ path: `${OUT}/k212-01-aluno-chat.png` });

  // --- Professor responsável (Caio): selo real no menu, caixa com não lidas primeiro --------------------
  const caio = await desk("trainer2.seed@example.com");
  ok("menu 'Chat' disponível com o selo real (2 não lidas do seed)", (await sidebarChat(caio).innerText()).includes("2"), await sidebarChat(caio).innerText());
  await sidebarChat(caio).click();
  await caio.waitForURL(`${BASE}/chat`);
  const inbox = caio.getByRole("list", { name: "Conversas" });
  const firstEntry = inbox.getByRole("link").first();
  ok("caixa: Camila primeiro (não lidas primeiro)", (await firstEntry.getAttribute("aria-label")) === "Camila Freitas, 2 mensagens não lidas", await firstEntry.getAttribute("aria-label"));
  ok("caixa inclui aluno sem mensagem nenhuma", (await inbox.getByText("Nenhuma mensagem ainda").count()) > 0);
  await caio.screenshot({ path: `${OUT}/k212-02-caixa.png` });
  await firstEntry.click();
  await caio.waitForURL(`${BASE}/chat?aluno=${CAMILA}`);
  ok("conversa abre no painel", await waitText(caio, "Combinado, obrigada!"));
  ok("abrir a conversa zera o selo do menu", await until(async () => !/\d/.test(await sidebarChat(caio).innerText())));

  // Cursor por pessoa: o owner continua com as 2 não lidas depois de o Caio ler.
  const owner = await desk("owner.seed@example.com");
  ok("owner mantém o próprio não lido (cursor independente)", (await sidebarChat(owner).innerText()).includes("2"), await sidebarChat(owner).innerText());
  await owner.context().close();

  // --- Aluno envia (canário) → professor recebe sem recarregar -------------------------------------------
  await input.fill(CANARY);
  await sp.getByRole("button", { name: "Enviar" }).click();
  ok("aluno: mensagem confirmada (hora no lugar de 'Enviando…')", await waitGone(sp, "Enviando…"));
  ok("professor recebe sem recarregar (Realtime)", await waitText(caio, CANARY));
  await sp.waitForTimeout(1500);
  ok("aluno: canário aparece uma vez só (retorno do RPC + Realtime deduplicados)", (await sp.getByText(CANARY, { exact: true }).count()) === 1);
  ok("banco: uma linha só do canário", (await dbCount(CANARY)) === 1);

  // --- Professor responde → aluno recebe sem recarregar; selo na aba fora da conversa ---------------------------
  const reply = `Resposta do professor ${RUN}`;
  await caio.getByRole("textbox", { name: "Mensagem" }).fill(reply);
  await caio.getByRole("textbox", { name: "Mensagem" }).press("Enter"); // desktop: Enter envia
  ok("aluno recebe a resposta sem recarregar", await waitText(sp, reply));
  // Depois de enviar, o foco volta ao campo (teclado aberto): a barra some até o teclado fechar (3.2).
  await input.blur();
  await nav.getByRole("link", { name: "Hoje" }).click();
  await sp.waitForURL(`${BASE}/aluno`);
  // A conversa marca como lida até a última mensagem exibida (mark_chat_read com p_until_message_id). Espera o cursor da
  // aluna chegar na resposta, em vez de um tempo fixo; a próxima mensagem fica não lida mesmo que a marcação atrase.
  const { data: replyRow } = await admin.from("chat_messages").select("id, student_id").eq("body", reply).single();
  ok("cursor da aluna vai até a resposta exibida", await until(async () => {
    const { data } = await admin.from("chat_reads").select("last_read_message_id").eq("student_id", replyRow.student_id).eq("reader_role", "student").maybeSingle();
    return data?.last_read_message_id === replyRow.id;
  }));
  const second = `Outra resposta ${RUN}`;
  await caio.getByRole("textbox", { name: "Mensagem" }).fill(second);
  await caio.getByRole("textbox", { name: "Mensagem" }).press("Enter");
  ok("fora da conversa, a aba Chat ganha selo de não lida", await until(async () => (await chatTab(sp).getAttribute("aria-label")) === "Chat, 1 mensagem não lida"));
  await sp.screenshot({ path: `${OUT}/k212-03-selo-aba.png` });
  await chatTab(sp).click();
  await sp.waitForURL(`${BASE}/aluno/chat`);
  ok("na conversa, a mensagem nova aparece e o selo some", (await waitText(sp, second)) && (await chatTab(sp).getAttribute("aria-label")) === null);

  // --- Anexo de exercício do treino ativo --------------------------------------------------------------
  await sp.getByRole("button", { name: "Anexar exercício" }).click();
  const dialog = sp.getByRole("dialog");
  await dialog.waitFor();
  const option = dialog.locator("button[aria-pressed]").first();
  const exercise = (await option.innerText()).trim();
  await option.click();
  ok("anexo aparece no campo", await waitText(sp, `Exercício: ${exercise}`));
  const withAttachment = `Dúvida neste exercício ${RUN}`;
  await input.fill(withAttachment);
  await sp.getByRole("button", { name: "Enviar" }).click();
  ok("mensagem com anexo enviada", await waitGone(sp, "Enviando…"));
  ok("professor vê o exercício anexado", await waitText(caio, `Exercício: ${exercise}`));

  // --- Sem internet: não enviada → volta → reenvio -----------------------------------------------------
  const offline = `Sem internet ${RUN}`;
  await sp.ctx.setOffline(true);
  await input.fill(offline);
  await sp.getByRole("button", { name: "Enviar" }).click();
  ok("sem internet: 'Não enviada' + aviso", (await waitText(sp, "Não enviada")) && (await waitText(sp, "Sem conexão. A mensagem não foi enviada.")));
  await sp.screenshot({ path: `${OUT}/k212-04-nao-enviada.png` });
  await sp.ctx.setOffline(false);
  // Logo depois de voltar, o reenvio ainda pode falhar (como no celular): o usuário toca de novo. O "Não enviada" some
  // no clique (vira "Enviando…"), então a confirmação de verdade é a linha no banco.
  const resent = await until(async () => {
    const retry = sp.getByRole("button", { name: "Tentar de novo" });
    if (await retry.count()) await retry.click().catch(() => {});
    await sp.waitForTimeout(1500);
    return (await dbCount(offline)) === 1 && (await sp.getByText("Não enviada").count()) === 0;
  }, 20000);
  ok("internet de volta: reenviada", resent);
  ok("banco: uma linha só", (await dbCount(offline)) === 1, String(await dbCount(offline)));

  // --- Queda do Realtime: "Reconectando…", e a volta busca o que chegou no meio-tempo ---------------------
  ws.blocked = true;
  for (const s of ws.sockets.splice(0)) await s.close().catch(() => {});
  ok("queda do Realtime: aviso 'Reconectando…'", await waitText(sp, "Reconectando…", 20000));
  await sp.screenshot({ path: `${OUT}/k212-05-reconectando.png` });

  // Resposta perdida depois de gravar: com o Realtime fora, nada "conserta" a bolha por fora — o "Tentar de novo" com o
  // mesmo client_msg_id tem de devolver a linha já gravada, sem duplicar. (Com o Realtime no ar, o evento da linha
  // gravada já transforma a bolha em enviada sozinho.)
  const lost = `Resposta perdida ${RUN}`;
  await sp.route("**/rest/v1/rpc/send_chat_message", async (route) => { await route.fetch(); await route.abort("failed"); }, { times: 1 });
  await input.fill(lost);
  await sp.getByRole("button", { name: "Enviar" }).click();
  ok("gravou, mas a resposta se perdeu: 'Não enviada'", await waitText(sp, "Não enviada"));
  ok("banco: já gravada antes do reenvio", (await dbCount(lost)) === 1);
  await sp.getByRole("button", { name: "Tentar de novo" }).click();
  ok("'Tentar de novo' confirma", await waitGone(sp, "Não enviada"));
  ok("banco: o reenvio com o mesmo id não duplicou", (await dbCount(lost)) === 1, String(await dbCount(lost)));
  ok("tela: aparece uma vez só", (await sp.getByText(lost, { exact: true }).count()) === 1);
  const during = `Enviada durante a queda ${RUN}`;
  await caio.getByRole("textbox", { name: "Mensagem" }).fill(during);
  await caio.getByRole("textbox", { name: "Mensagem" }).press("Enter");
  ws.blocked = false;
  ok("reconectou: aviso some", await waitGone(sp, "Reconectando…", 45000));
  ok("a mensagem enviada durante a queda aparece (busca ao reconectar)", await waitText(sp, during, 15000));

  // --- Limite de 30/min: mensagem amigável, texto continua no campo ---------------------------------------
  const filler = Array.from({ length: 30 }, (_, i) => ({
    organization_id: null, student_id: CAMILA, sender_role: "student", sender_id: null, body: `limite ${RUN} ${i}`, client_msg_id: randomUUID(),
  }));
  const { data: st } = await admin.from("students").select("organization_id").eq("id", CAMILA).single();
  for (const f of filler) f.organization_id = st.organization_id;
  await admin.from("chat_messages").insert(filler);
  const overLimit = `Uma a mais ${RUN}`;
  await input.fill(overLimit);
  await sp.getByRole("button", { name: "Enviar" }).click();
  ok("31ª no minuto: mensagem amigável", await waitText(sp, "Você enviou muitas mensagens seguidas. Aguarde um minuto."));
  ok("o texto continua no campo", (await input.inputValue()) === overLimit);
  ok("banco: a 31ª não foi gravada", (await dbCount(overLimit)) === 0);
  await sp.screenshot({ path: `${OUT}/k212-06-limite.png` });

  // --- Corpo nunca em URL, título ou console ----------------------------------------------------------------
  for (const [name, p] of [["aluno", sp], ["professor", caio]]) {
    const leaks = [...p.urls, await p.title(), ...p.consoleLines].filter((x) => x.includes(CANARY));
    ok(`${name}: canário fora de URL, título e console`, leaks.length === 0, leaks.join(" | "));
    ok(`${name}: sem erro de página`, p.errors.length === 0, p.errors.join(" | "));
  }
} finally {
  // Limpa o que o roteiro criou: todo texto enviado aqui contém o marcador da execução (o relógio local pode não bater
  // com o do banco, então nada de filtrar por horário).
  await admin.from("chat_messages").delete().eq("student_id", CAMILA).like("body", `%${RUN}%`);
  await browser.close();
}
console.log(`\nFrase-canário para buscar nos logs do Supabase: ${CANARY}`);
process.exit(fails ? 1 : 0);
