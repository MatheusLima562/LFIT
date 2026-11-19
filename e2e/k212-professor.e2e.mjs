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
const toastWith = async (p, text) => { await p.locator("[data-sonner-toast]", { hasText: text }).last().waitFor({ timeout: 15000 }).catch(() => {}); return (await p.locator("[data-sonner-toast]", { hasText: text }).count()) > 0; };

// 3.3 enxuta: recado (publicar/encerrar) e resposta ao feedback. Caio = professor responsável da Camila; o owner acessa a
// Camila mas não vê a saúde dela (consentimento não confirmado) — não vê o comentário nem o campo de resposta.
const RUN = `${Date.now()}`;
const RECADO = `Recado e2e ${RUN}`, GERAL = `Recado geral e2e ${RUN}`, FEEDBACK = `Comentário e2e ${RUN}`, RESPOSTA = `Resposta e2e ${RUN}`;

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
const camilaUser = users.users.find((x) => x.email === "aluno.seed@example.com").id;
const { data: camila } = await admin.from("students").select("id, organization_id").eq("user_id", camilaUser).single();
const { data: plan } = await admin.from("training_plans").select("id").eq("student_id", camila.id).eq("status", "active").single();
const { data: workout } = await admin.from("plan_workouts").select("id, label, name").eq("plan_id", plan.id).order("position").limit(1).single();
// Uma sessão concluída com comentário (como se a aluna tivesse treinado ontem).
const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
const { data: session, error: sErr } = await admin.from("workout_sessions").insert({
  organization_id: camila.organization_id, student_id: camila.id, plan_id: plan.id, workout_id: workout.id, workout_label: workout.label,
  workout_name: workout.name, snapshot: {}, status: "completed", started_at: yesterday, finished_at: yesterday, rpe: 7, feedback_note: FEEDBACK,
}).select("id").single();
if (sErr) throw new Error(`sessão de teste: ${sErr.message}`);

try {
  // --- Professor responsável: publica recado, vê o comentário e responde ----------------------------------------
  const caio = await login("trainer2.seed@example.com", "/entrar", { width: 1440, height: 900 });
  await caio.goto(`${BASE}/alunos/${camila.id}/treinos`);
  await settle(caio);
  ok("professor: seções de recado e sessões recentes", (await waitText(caio, "Recado para este aluno")) && (await waitText(caio, "Sessões recentes")));
  ok("professor: vê o comentário da aluna", await waitText(caio, FEEDBACK));
  await caio.getByLabel("Novo recado").fill(RECADO);
  await caio.getByRole("button", { name: "Publicar recado" }).click();
  ok("professor: recado publicado (toast sem o texto)", (await toastWith(caio, "Recado publicado.")) && (await caio.locator("[data-sonner-toast]", { hasText: RECADO }).count()) === 0);
  ok("professor: recado atual com 'Encerrar'", (await waitText(caio, RECADO)) && (await caio.getByRole("button", { name: "Encerrar recado" }).isVisible()));
  await caio.getByRole("button", { name: "Responder" }).first().click();
  await caio.getByLabel("Sua resposta").fill("a".repeat(320));
  ok("resposta: limite de 300 caracteres no campo", (await caio.getByLabel("Sua resposta").inputValue()).length === 300);
  ok("resposta: contador 300/300", await caio.getByText("300/300", { exact: true }).isVisible());
  await caio.getByLabel("Sua resposta").fill(RESPOSTA);
  ok("resposta: contador acompanha o texto", await caio.getByText(`${RESPOSTA.length}/300`, { exact: true }).isVisible());
  await caio.getByRole("button", { name: "Enviar resposta" }).click();
  ok("professor: resposta enviada", (await toastWith(caio, "Resposta enviada")) && (await waitText(caio, RESPOSTA)));
  await caio.screenshot({ path: `${OUT}/k212-prof-01-aluno.png`, fullPage: true });
  await caio.setViewportSize({ width: 375, height: 812 });
  await caio.waitForTimeout(500);
  ok("professor a 375 px: sem rolagem horizontal", (await caio.evaluate(() => document.documentElement.scrollWidth)) <= 375);
  await caio.screenshot({ path: `${OUT}/k212-prof-01b-375.png`, fullPage: true });
  await caio.setViewportSize({ width: 1440, height: 900 });

  // --- Aluna (375 px): vê o recado na Hoje e a resposta no Histórico -----------------------------------------
  const sp = await login("aluno.seed@example.com", "/aluno/entrar", { width: 375, height: 812 });
  ok("aluna: recado novo na Hoje", await waitText(sp, RECADO));
  await sp.goto(`${BASE}/aluno/historico`);
  await settle(sp);
  ok("aluna: resposta do professor no Histórico", await waitText(sp, RESPOSTA));
  ok("aluna: sem rolagem horizontal", (await sp.evaluate(() => document.documentElement.scrollWidth)) <= 375);
  await sp.screenshot({ path: `${OUT}/k212-prof-02-historico.png`, fullPage: true });

  // --- Encerrar: o recado some para a aluna ------------------------------------------------------------------
  await caio.getByRole("button", { name: "Encerrar recado" }).click();
  ok("professor: recado encerrado", await toastWith(caio, "Recado encerrado."));
  await sp.goto(`${BASE}/aluno`);
  await settle(sp);
  ok("aluna: recado encerrado não aparece mais", (await sp.getByText(RECADO).count()) === 0);

  // --- Recado para todos (caixa de conversas) ------------------------------------------------------------------
  await caio.goto(`${BASE}/chat`);
  await settle(caio);
  await caio.getByRole("button", { name: "Recado para todos" }).click();
  const dialog = caio.getByRole("dialog");
  await dialog.getByLabel("Novo recado").fill(GERAL);
  await dialog.getByRole("button", { name: "Publicar recado" }).click();
  ok("professor: recado para todos publicado", (await toastWith(caio, "Recado publicado.")) && (await dialog.getByText(GERAL).waitFor({ timeout: 10000 }).then(() => true, () => false)));
  await dialog.getByRole("button", { name: "Encerrar recado" }).click();
  ok("professor: recado para todos encerrado", await toastWith(caio, "Recado encerrado."));

  // --- Owner sem acesso à saúde da Camila: recado sim, comentário e resposta não ------------------------------
  const owner = await login("owner.seed@example.com", "/entrar", { width: 1440, height: 900 });
  await owner.goto(`${BASE}/alunos/${camila.id}/treinos`);
  await settle(owner);
  ok("owner: vê a seção de recado", await waitText(owner, "Recado para este aluno"));
  ok("owner sem acesso à saúde: sem comentário, sem 'Responder' e sem caixa de resposta",
    (await owner.getByText(FEEDBACK).count()) === 0 && (await owner.getByRole("button", { name: "Responder" }).count()) === 0 &&
      (await owner.getByLabel("Sua resposta").count()) === 0);
  const note = owner.getByRole("note").filter({ hasText: "Você não pode ver nem responder ao feedback deste aluno" });
  ok("owner sem acesso à saúde: aviso claro do motivo", (await note.isVisible()) && (await note.innerText()).includes("fale com o professor responsável"));
  await owner.setViewportSize({ width: 375, height: 812 });
  await owner.waitForTimeout(500);
  ok("owner a 375 px: aviso visível e sem rolagem horizontal", (await note.isVisible()) && (await owner.evaluate(() => document.documentElement.scrollWidth)) <= 375);
  await note.scrollIntoViewIfNeeded();
  await owner.screenshot({ path: `${OUT}/k212-prof-03-sem-saude-375.png` });

  // --- Texto nunca em URL ---------------------------------------------------------------------------------------
  const leaks = [...caio.urls, ...sp.urls, ...owner.urls].filter((u) => [RECADO, GERAL, RESPOSTA, FEEDBACK].some((x) => decodeURIComponent(u).includes(x)));
  ok("nenhum texto de recado/resposta em URL", leaks.length === 0, leaks.join(" | "));
  for (const [name, p] of [["professor", caio], ["aluna", sp], ["owner", owner]]) ok(`${name}: sem erro de página`, p.errors.length === 0, p.errors.join(" | "));
} finally {
  await admin.from("workout_sessions").delete().eq("id", session.id);
  await admin.from("trainer_announcements").delete().in("body", [RECADO, GERAL]);
  await browser.close();
}
if (fails) { console.log(`\n${fails} falha(s).`); process.exit(1); }
