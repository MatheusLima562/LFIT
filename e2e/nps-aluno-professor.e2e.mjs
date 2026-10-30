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

// NPS identificado: cartão na Hoje (375 px), "Agora não", "Pedir avaliação" do professor (com motivo quando o aluno não
// pode) e card no Início. A resposta não se apaga pela API (sem DELETE): o executor recria os dados (reseed) antes.
const RUN = `${Date.now()}`;
const COMMENT = `Comentário NPS e2e ${RUN}`;
const DAY = 86_400_000;

async function login(email, path, viewport) {
  const ctx = await browser.newContext({ viewport, ...(viewport.width < 500 ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  page.errors = []; page.on("pageerror", (e) => page.errors.push(e.message));
  page.urls = []; page.on("framenavigated", (f) => f === page.mainFrame() && page.urls.push(f.url()));
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
const { data: camila } = await admin.from("students").select("id, organization_id, first_name").eq("user_id", userId("aluno.seed@example.com")).single();
const { data: diego } = await admin.from("students").select("id").eq("user_id", userId("aluno.consentimento.seed@example.com")).single();
const { data: plan } = await admin.from("training_plans").select("id").eq("student_id", camila.id).eq("status", "active").single();
const { data: workout } = await admin.from("plan_workouts").select("id, label").eq("plan_id", plan.id).order("position").limit(1).single();
// 8 treinos concluídos, o primeiro há 40 dias: a Camila fica apta a responder.
const sessionRows = [40, 35, 30, 25, 20, 15, 10, 5].map((d) => {
  const at = new Date(Date.now() - d * DAY).toISOString();
  return { organization_id: camila.organization_id, student_id: camila.id, plan_id: plan.id, workout_id: workout.id, workout_label: workout.label, snapshot: {}, status: "completed", started_at: at, finished_at: at };
});
const { data: inserted, error: sErr } = await admin.from("workout_sessions").insert(sessionRows).select("id");
if (sErr) throw new Error(`sessões de teste: ${sErr.message}`);

try {
  // --- Aluna (375 px): cartão, aviso de identificação, "Agora não" ----------------------------------------------
  const sp = await login("aluno.seed@example.com", "/aluno/entrar", { width: 375, height: 812 });
  const card = sp.getByRole("region", { name: /Como está sendo treinar com/ });
  ok("aluna: cartão do NPS na Hoje", await card.waitFor({ timeout: 15000 }).then(() => true, () => false));
  ok("aluna: aviso claro de que não é anônimo", await card.getByText("Não é anônimo").isVisible());
  ok("aluna: 11 opções de nota (0 a 10)", (await card.getByRole("radio").count()) === 11);
  ok("375 px: sem rolagem horizontal", (await sp.evaluate(() => document.documentElement.scrollWidth)) <= 375);
  await card.scrollIntoViewIfNeeded();
  await sp.screenshot({ path: `${OUT}/nps-01-cartao-375.png`, fullPage: true });
  await card.getByRole("button", { name: "Agora não" }).click();
  ok("aluna: 'Agora não' esconde o cartão", await card.waitFor({ state: "detached", timeout: 10000 }).then(() => true, () => false));
  await sp.reload();
  await settle(sp);
  ok("aluna: cartão continua escondido depois de recarregar", (await sp.getByRole("region", { name: /Como está sendo treinar com/ }).count()) === 0);

  // --- Professor: "Pedir avaliação" — motivo para quem não pode, pedido para a Camila --------------------------------
  const caio = await login("trainer2.seed@example.com", "/entrar", { width: 1440, height: 900 });
  if (diego) {
    await caio.goto(`${BASE}/alunos/${diego.id}/treinos`);
    await settle(caio);
    const btn = caio.getByRole("button", { name: "Pedir avaliação" });
    if (await btn.count()) {
      await btn.click();
      ok("professor: motivo quando o aluno ainda não pode responder", await waitText(caio, /Ainda é cedo|treinos concluídos|não tem acesso|não está ativo/));
    }
  }
  await caio.goto(`${BASE}/alunos/${camila.id}/treinos`);
  await settle(caio);
  await caio.getByRole("button", { name: "Pedir avaliação" }).click();
  ok("professor: pedido feito (sem notificação externa)", await waitText(caio, "na próxima vez que abrir o app"));
  await caio.getByRole("button", { name: "Pedir avaliação" }).click();
  ok("professor: pedido repetido não duplica", await waitText(caio, "O pedido já está feito"));

  // --- Aluna: o pedido traz o cartão de volta; responde com comentário ----------------------------------------------
  await sp.reload();
  await settle(sp);
  const again = sp.getByRole("region", { name: /Como está sendo treinar com/ });
  ok("aluna: pedido do professor traz o cartão de volta", await again.waitFor({ timeout: 15000 }).then(() => true, () => false));
  await again.getByRole("radio", { name: "Nota 4 de 10" }).check({ force: true });
  await again.getByLabel("Quer contar o motivo? (opcional)").fill("x".repeat(320));
  ok("aluna: comentário limitado a 300", (await again.getByLabel("Quer contar o motivo? (opcional)").inputValue()).length === 300);
  await again.getByLabel("Quer contar o motivo? (opcional)").fill(COMMENT);
  await again.getByRole("button", { name: "Enviar avaliação" }).click();
  ok("aluna: agradecimento depois de enviar", await waitText(sp, "Sua avaliação foi enviada"));
  await sp.screenshot({ path: `${OUT}/nps-02-enviado-375.png` });
  const { data: saved } = await admin.from("nps_responses").select("score, comment").eq("student_id", camila.id);
  ok("banco: nota e comentário gravados", saved?.length === 1 && saved[0].score === 4 && saved[0].comment === COMMENT);

  // --- Início: card do NPS (1 resposta → dados insuficientes) com o detrator ------------------------------------------
  await caio.goto(`${BASE}/`);
  await settle(caio);
  const nps = caio.getByRole("region", { name: "NPS dos alunos" });
  ok("Início: card NPS com 'Dados insuficientes'", (await nps.waitFor({ timeout: 15000 }).then(() => true, () => false)) && (await nps.getByText(/Dados insuficientes/).isVisible()));
  ok("Início: detrator com nome e nota", (await nps.getByText(camila.first_name, { exact: false }).count()) > 0 && (await nps.getByText(/Nota 4/).count()) > 0);
  ok("Início (responsável): comentário visível", (await nps.getByText(COMMENT).count()) === 1);
  await nps.scrollIntoViewIfNeeded();
  await caio.screenshot({ path: `${OUT}/nps-03-inicio.png` });

  const leaks = [...sp.urls, ...caio.urls].filter((u) => decodeURIComponent(u).includes(RUN));
  ok("comentário nunca em URL", leaks.length === 0, leaks.join(" | "));
  for (const [name, p] of [["aluna", sp], ["professor", caio]]) ok(`${name}: sem erro de página`, p.errors.length === 0, p.errors.join(" | "));
} finally {
  await admin.from("workout_sessions").delete().in("id", (inserted ?? []).map((r) => r.id));
  await admin.from("nps_prompts").delete().eq("student_id", camila.id);
  await browser.close();
}
if (fails) { console.log(`\n${fails} falha(s).`); process.exit(1); }
