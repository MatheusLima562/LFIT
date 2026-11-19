import "./_guard.mjs";
import { waitLoggedIn } from "./_login.mjs";
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

// NPS v2: cartão automático na Hoje (375 px), só nota (sem comentário), lembrete do professor dentro do cartão, "Agora
// não" que aparece para a equipe só como "indisponível", confirmação antes de enviar e card do Início só com agregados.
// A resposta não se apaga pela API (sem DELETE): o executor recria os dados (reseed) antes.
const DAY = 86_400_000;
const CARD = /Como está sendo treinar com/;

async function login(email, path, viewport) {
  const ctx = await browser.newContext({ viewport, ...(viewport.width < 500 ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  page.errors = []; page.on("pageerror", (e) => page.errors.push(e.message));
  await page.goto(`${BASE}${path}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Entrar" }).click();
  await waitLoggedIn(page, path === "/aluno/entrar" ? `${BASE}/aluno` : `${BASE}/`);
  await settle(page);
  return page;
}

const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
const userId = (email) => users.users.find((x) => x.email === email).id;
const { data: camila } = await admin.from("students").select("id, organization_id, first_name, last_name").eq("user_id", userId("aluno.seed@example.com")).single();
const { data: plan } = await admin.from("training_plans").select("id").eq("student_id", camila.id).eq("status", "active").single();
const { data: workout } = await admin.from("plan_workouts").select("id, label").eq("plan_id", plan.id).order("position").limit(1).single();
// 8 treinos concluídos, o primeiro há 40 dias: a Camila fica apta (critérios de private.nps_settings).
const sessionRows = [40, 35, 30, 25, 20, 15, 10, 5].map((d) => {
  const at = new Date(Date.now() - d * DAY).toISOString();
  return { organization_id: camila.organization_id, student_id: camila.id, plan_id: plan.id, workout_id: workout.id, workout_label: workout.label, snapshot: {}, status: "completed", started_at: at, finished_at: at };
});
const { data: inserted, error: sErr } = await admin.from("workout_sessions").insert(sessionRows).select("id");
if (sErr) throw new Error(`sessões de teste: ${sErr.message}`);

try {
  // --- Aluna (375 px): cartão automático, só a nota, aviso de resultado agrupado ------------------------------------
  const sp = await login("aluno.seed@example.com", "/aluno/entrar", { width: 375, height: 812 });
  const card = sp.getByRole("region", { name: CARD });
  ok("aluna: cartão do NPS aparece sozinho na Hoje", await card.waitFor({ timeout: 15000 }).then(() => true, () => false));
  ok("aluna: aviso 'apenas o resultado agrupado'", await card.getByText("No app, seu professor vê apenas o resultado agrupado das avaliações, nunca a nota de cada aluno.").isVisible());
  ok("aluna: 11 opções de nota (0 a 10)", (await card.getByRole("radio").count()) === 11);
  ok("aluna: sem campo de comentário", (await card.getByRole("textbox").count()) === 0);
  ok("aluna: ainda sem frase de lembrete", (await card.getByText("Sua opinião ajuda a melhorar o atendimento.").count()) === 0);
  ok("375 px: sem rolagem horizontal", (await sp.evaluate(() => document.documentElement.scrollWidth)) <= 375);
  await card.scrollIntoViewIfNeeded();
  await sp.screenshot({ path: `${OUT}/nps-01-cartao-375.png`, fullPage: true });

  // --- Professor: estado "pode avaliar" e lembrete (uma vez) ---------------------------------------------------------
  const caio = await login("trainer2.seed@example.com", "/entrar", { width: 1440, height: 900 });
  await caio.goto(`${BASE}/alunos/${camila.id}/treinos`);
  await settle(caio);
  ok("professor: 'O aluno pode avaliar e ainda não respondeu.'", await waitText(caio, "O aluno pode avaliar e ainda não respondeu."));
  await caio.getByRole("button", { name: "Enviar lembrete" }).click();
  ok("professor: lembrete enviado (sem notificação externa)", await waitText(caio, "Lembrete enviado: o aluno verá no cartão de avaliação."));
  ok("professor: botão some depois do lembrete", (await caio.getByRole("button", { name: "Enviar lembrete" }).count()) === 0);
  const { data: reminders } = await admin.from("nps_reminders").select("id").eq("student_id", camila.id);
  ok("banco: um lembrete gravado", reminders?.length === 1);

  // --- Aluna: frase do lembrete no próprio cartão (sem citar o professor); "Agora não" ------------------------------------
  await sp.reload();
  await settle(sp);
  ok("aluna: frase do lembrete no cartão", await card.getByText("Sua opinião ajuda a melhorar o atendimento.").waitFor({ timeout: 15000 }).then(() => true, () => false));
  await card.getByRole("button", { name: "Agora não" }).click();
  ok("aluna: 'Agora não' esconde o cartão", await card.waitFor({ state: "detached", timeout: 10000 }).then(() => true, () => false));
  await sp.reload();
  await settle(sp);
  ok("aluna: cartão continua escondido depois de recarregar", (await sp.getByRole("region", { name: CARD }).count()) === 0);

  // --- Professor: "Agora não" aparece só como indisponível, sem data ------------------------------------------------------
  await caio.reload();
  await settle(caio);
  const panel = caio.getByRole("heading", { name: "Avaliação do acompanhamento (NPS)" }).locator("xpath=ancestor::section[1]");
  ok("professor: 'Avaliação indisponível no momento.'", await waitText(caio, "Avaliação indisponível no momento."));
  const panelText = await panel.innerText();
  ok("professor: sem data e sem revelar a recusa", !/\d{2}\/\d{2}\/\d{4}|agora não|recus/i.test(panelText), panelText);
  ok("professor: sem 'Enviar lembrete' enquanto indisponível", (await caio.getByRole("button", { name: "Enviar lembrete" }).count()) === 0);

  // --- Fim do "Agora não" (simulado: o estado é apagado com a secret key — sem UPDATE nessa tabela) -----------------------
  await admin.from("nps_prompts").delete().eq("student_id", camila.id);
  await sp.reload();
  await settle(sp);
  const again = sp.getByRole("region", { name: CARD });
  ok("aluna: cartão volta depois do 'Agora não'", await again.waitFor({ timeout: 15000 }).then(() => true, () => false));
  await again.getByRole("radio", { name: "Nota 4 de 10" }).check({ force: true });
  await again.getByRole("button", { name: "Enviar avaliação" }).click();
  const confirm = sp.getByRole("alertdialog", { name: "Enviar nota 4?" });
  ok("aluna: confirmação 'Enviar nota 4?' (não pode ser alterada; nova avaliação em 90 dias)",
    (await confirm.waitFor({ timeout: 5000 }).then(() => true, () => false)) && (await confirm.getByText(/não pode ser alterada.*90 dias/).isVisible()));
  await sp.waitForTimeout(400); // fim da animação de abertura
  await sp.screenshot({ path: `${OUT}/nps-02-confirmacao-375.png` });
  await confirm.getByRole("button", { name: "Voltar" }).click();
  await sp.waitForTimeout(800);
  ok("aluna: 'Voltar' não envia", ((await admin.from("nps_responses").select("id").eq("student_id", camila.id)).data ?? []).length === 0 && (await again.isVisible()));
  await again.getByRole("button", { name: "Enviar avaliação" }).click();
  await sp.getByRole("alertdialog", { name: "Enviar nota 4?" }).getByRole("button", { name: "Enviar nota 4" }).click();
  ok("aluna: agradecimento depois de enviar", await waitText(sp, "Sua avaliação foi enviada"));
  await sp.screenshot({ path: `${OUT}/nps-03-enviado-375.png` });
  const { data: saved } = await admin.from("nps_responses").select("score, comment").eq("student_id", camila.id);
  ok("banco: só a nota, sem comentário", saved?.length === 1 && saved[0].score === 4 && saved[0].comment === null);

  // --- Professor: depois da resposta, nada de nota nem data --------------------------------------------------------------
  await caio.reload();
  await settle(caio);
  ok("professor: 'Nenhuma avaliação pendente para este aluno agora.'", await waitText(caio, "Nenhuma avaliação pendente para este aluno agora."));

  // --- Início: só agregado (trimestre fechado; poucas respostas) -----------------------------------------------------------
  await caio.goto(`${BASE}/`);
  await settle(caio);
  const nps = caio.getByRole("region", { name: "NPS dos alunos" });
  ok("Início: card NPS com 'Poucas respostas para exibir.'", (await nps.waitFor({ timeout: 15000 }).then(() => true, () => false)) && (await nps.getByText("Poucas respostas para exibir.").isVisible()));
  const npsText = await nps.innerText();
  ok("Início: nenhum nome de aluno nem nota individual", !npsText.includes(camila.first_name) && !/Nota \d/.test(npsText), npsText);
  await nps.scrollIntoViewIfNeeded();
  await caio.screenshot({ path: `${OUT}/nps-04-inicio.png` });

  for (const [name, p] of [["aluna", sp], ["professor", caio]]) ok(`${name}: sem erro de página`, p.errors.length === 0, p.errors.join(" | "));
} finally {
  await admin.from("workout_sessions").delete().in("id", (inserted ?? []).map((r) => r.id));
  await admin.from("nps_prompts").delete().eq("student_id", camila.id);
  await admin.from("nps_reminders").delete().eq("student_id", camila.id);
  await browser.close();
}
if (fails) { console.log(`\n${fails} falha(s).`); process.exit(1); }
