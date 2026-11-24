import "./_guard.mjs";
import { waitLoggedIn } from "./_login.mjs";
import { resetCamilaSessions, seedIds } from "./_fixtures.mjs";
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
const toast = (p, text) => p.locator("[data-sonner-toast]", { hasText: text }).first().waitFor({ timeout: 15000 }).then(() => true, () => false);
const until = async (fn, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 300)); } return false; };

// Edição rápida da prescrição (sprint edição, PARTE A) — celular 375 px e desktop. Dados próprios: o treino A ativo da
// Camila (valores anotados no começo e devolvidos no fim), uma sessão concluída com séries diferentes da prescrição e o
// histórico de alterações dela (apagado no fim).
const { camila, org } = await seedIds(admin);
const { data: plan } = await admin.from("training_plans").select("id").eq("student_id", camila).eq("status", "active").single();
const { data: wA } = await admin.from("plan_workouts").select("id, label").eq("plan_id", plan.id).eq("label", "A").single();
const { data: items } = await admin.from("plan_workout_items").select("id, position, sets, quantity_min, quantity_max, quantity_unit, load_value, load_unit, load_text, exercise_id, plan_item_sets(id), exercises(name)").eq("workout_id", wA.id).order("position");
const original = items.map((i) => ({ id: i.id, sets: i.sets, quantity_min: i.quantity_min, quantity_max: i.quantity_max, load_value: i.load_value, load_unit: i.load_unit }));
const target = items.find((i) => !i.plan_item_sets.length && i.load_text === null && i.load_value !== null && i.quantity_unit === "reps");
const name = target.exercises.name;
const itemRow = async () => (await admin.from("plan_workout_items").select("sets, quantity_min, quantity_max, load_value").eq("id", target.id).single()).data;
let sessionId = null;

async function login(viewport) {
  const mobile = viewport.width < 500;
  const page = await (await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile })).newPage();
  page.errors = []; page.on("pageerror", (e) => page.errors.push(e.message));
  await page.goto(`${BASE}/entrar`);
  await page.getByLabel("E-mail").fill("owner.seed@example.com");
  await page.getByLabel("Senha", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Entrar" }).click();
  await waitLoggedIn(page, `${BASE}/`);
  return page;
}

try {
  await resetCamilaSessions(admin);
  await admin.from("prescription_changes").delete().eq("student_id", camila);
  // Sessão concluída: 3 séries com 5 kg a mais que a prescrição.
  const heavier = Number(target.load_value) + 5;
  const { data: ws, error } = await admin.from("workout_sessions").insert({
    organization_id: org, student_id: camila, plan_id: plan.id, workout_id: wA.id, workout_label: "A", snapshot: {}, status: "completed",
    started_at: new Date(Date.now() - 3_600_000).toISOString(), finished_at: new Date(Date.now() - 600_000).toISOString(),
  }).select("id").single();
  if (error) throw new Error(error.message);
  sessionId = ws.id;
  const { data: il } = await admin.from("session_item_logs").insert({ organization_id: org, session_id: sessionId, item_id: target.id, exercise_id: target.exercise_id, exercise_name: name }).select("id").single();
  await admin.from("session_set_logs").insert([0, 1, 2].map((k) => ({ organization_id: org, item_log_id: il.id, exercise_id: target.exercise_id, set_index: k, load_value: heavier, load_unit: target.load_unit ?? "kg", quantity_value: target.quantity_min })));

  // --- Celular (375 px) ---------------------------------------------------------------------------------------------
  const page = await login({ width: 375, height: 812 });
  await page.goto(`${BASE}/alunos/${camila}/treinos`);
  const sug = page.getByTestId("suggestion").filter({ hasText: name });
  ok("sugestão 'Atualizar prescrição para X?' na ficha do aluno", await visible(sug));
  ok("texto com o valor sugerido", (await sug.innerText()).includes(`Atualizar prescrição para ${String(heavier).replace(".", ",")} kg?`), await sug.innerText());
  ok("nada mudou sozinho", Number((await itemRow()).load_value) === Number(target.load_value));
  await page.screenshot({ path: `${OUT}/edicao-rapida-01-sugestao-375.png`, fullPage: true });
  await sug.getByRole("button", { name: "Atualizar" }).click();
  ok("um toque aplica a sugestão", await toast(page, "Prescrição atualizada."));
  ok("banco: carga = registrada na sessão", await until(async () => Number((await itemRow()).load_value) === heavier));

  await page.getByRole("link", { name: "Edição rápida" }).click();
  await page.waitForURL(/\/treinos\/ficha$/);
  const card = page.getByTestId("quick-item").filter({ hasText: name });
  ok("ficha rápida com o exercício", await visible(card));
  await card.getByRole("button", { name: "Aumentar carga" }).click();
  await card.getByRole("button", { name: "Aumentar carga" }).click();
  await card.getByRole("button", { name: "Aumentar séries" }).click();
  ok("+ carga e + séries sem formulário (uma gravação)", await toast(page, "Prescrição atualizada."));
  ok("banco: carga +2 passos e +1 série", await until(async () => { const r = await itemRow(); return Number(r.load_value) === heavier + 5 && r.sets === target.sets + 1; }));
  const btn = await card.getByRole("button", { name: "Aumentar carga" }).boundingBox();
  ok("botões +/− com 44 px", btn && btn.width >= 44 && btn.height >= 44, JSON.stringify(btn));
  ok("sem rolagem horizontal a 375 px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.screenshot({ path: `${OUT}/edicao-rapida-02-ficha-375.png`, fullPage: true });

  // Progressão em lote com prévia.
  const bulk = page.getByRole("region", { name: "Progressão em lote" });
  await bulk.getByLabel("Percentual (%)").fill("10");
  await bulk.getByRole("button", { name: "Ver prévia" }).click();
  const preview = page.getByTestId("bulk-preview");
  ok("prévia antes → depois", await visible(preview.getByRole("row").filter({ hasText: name })));
  const before = await itemRow();
  ok("prévia não grava", Number(before.load_value) === heavier + 5);
  await preview.getByRole("button", { name: /^Aplicar/ }).click();
  ok("progressão aplicada", await toast(page, "Progressão aplicada."));
  ok("banco: carga subiu ~10% (no passo)", await until(async () => Number((await itemRow()).load_value) > heavier + 5));

  // Histórico + desfazer o lote.
  const history = page.getByRole("region", { name: "Histórico de alterações" });
  await page.reload();
  ok("histórico com quem/quando/antes→depois", await visible(history.getByTestId("history-batch").filter({ hasText: "Progressão em lote" })));
  await history.getByTestId("history-batch").filter({ hasText: "Progressão em lote" }).getByRole("button", { name: "Desfazer" }).click();
  ok("desfazer", await toast(page, "Alteração desfeita."));
  ok("banco: voltou ao valor antes do lote", await until(async () => Number((await itemRow()).load_value) === heavier + 5));
  ok("celular sem erro de página", page.errors.length === 0, page.errors.join(" | "));
  await page.context().close();

  // --- Desktop -------------------------------------------------------------------------------------------------------
  const desk = await login({ width: 1440, height: 900 });
  await desk.goto(`${BASE}/alunos/${camila}/treinos/ficha`);
  const dcard = desk.getByTestId("quick-item").filter({ hasText: name });
  ok("desktop: ficha rápida", await visible(dcard));
  await dcard.getByRole("button", { name: "Diminuir carga" }).click();
  ok("desktop: − carga", await toast(desk, "Prescrição atualizada."));
  ok("banco: −1 passo", await until(async () => Number((await itemRow()).load_value) === heavier + 2.5));
  // Desfazer pelo próprio aviso.
  await desk.locator("[data-sonner-toast]", { hasText: "Prescrição atualizada." }).getByRole("button", { name: "Desfazer" }).click();
  ok("desktop: desfazer pelo aviso", await until(async () => Number((await itemRow()).load_value) === heavier + 5));
  await desk.screenshot({ path: `${OUT}/edicao-rapida-03-desktop.png`, fullPage: true });
  ok("desktop sem erro de página", desk.errors.length === 0, desk.errors.join(" | "));
} catch (e) {
  ok("roteiro terminou", false, e.message);
} finally {
  for (const o of original) {
    await admin.from("plan_workout_items").update({ sets: o.sets, quantity_min: o.quantity_min, quantity_max: o.quantity_max, load_value: o.load_value, load_unit: o.load_unit }).eq("id", o.id);
  }
  await admin.from("prescription_changes").delete().eq("student_id", camila);
  if (sessionId) await admin.from("workout_sessions").delete().eq("id", sessionId);
  await resetCamilaSessions(admin).catch(() => {});
  await browser.close();
}
process.exit(fails ? 1 : 0);
