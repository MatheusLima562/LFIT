import "./_guard.mjs";
import { waitLoggedIn } from "./_login.mjs";
import { resetAbsence, resetCamilaSessions, seedIds } from "./_fixtures.mjs";
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

// Ausência e pausa (1.5). Dados próprios: a Camila (plano ativo do seed) fica com um único treino de 10 dias atrás, sem
// pausa e sem aviso recente; no fim, sessões e pausa voltam ao estado do seed.
const { camila, org } = await seedIds(admin);

async function login(path, email, viewport) {
  const mobile = viewport.width < 500;
  const page = await (await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile })).newPage();
  page.errors = []; page.on("pageerror", (e) => page.errors.push(e.message));
  await page.goto(`${BASE}${path === "/" ? "/entrar" : "/aluno/entrar"}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Entrar" }).click();
  await waitLoggedIn(page, `${BASE}${path}`);
  return page;
}

try {
  await resetCamilaSessions(admin);
  await resetAbsence(admin, camila);
  const tenDays = new Date(Date.now() - 10 * 86_400_000).toISOString();
  const { error } = await admin.from("workout_sessions").insert({ organization_id: org, student_id: camila, workout_label: "A", snapshot: {}, status: "completed", started_at: tenDays, finished_at: tenDays });
  if (error) throw new Error(error.message);

  // Aluna (375 px): aviso gentil uma vez.
  const aluna = await login("/aluno", "aluno.seed@example.com", { width: 375, height: 812 });
  ok("aviso gentil no Hoje depois de 7+ dias", await visible(aluna.getByText("Faz 10 dias desde o seu último treino. Que tal voltar hoje, no seu ritmo?")));
  ok("aluna: sem rolagem horizontal", await aluna.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await aluna.screenshot({ path: `${OUT}/ausencia-01-aluna.png` });
  await aluna.reload();
  await aluna.getByRole("heading", { level: 1 }).waitFor();
  await aluna.waitForTimeout(2500);
  ok("não aparece de novo na mesma semana", (await aluna.getByText(/Faz 10 dias desde o seu último treino/).count()) === 0);

  // Personal: card no Início, mensagem e pausa.
  const owner = await login("/", "owner.seed@example.com", { width: 1440, height: 900 });
  const card = owner.locator("section[aria-labelledby='card-inactive']");
  ok("Início: 'Sem treinar há 7+ dias' com a Camila", await visible(card.getByText(/Camila/)));
  ok("botão 'Enviar mensagem' leva ao chat da aluna", ((await card.getByRole("link", { name: /Enviar mensagem para Camila/ }).getAttribute("href")) ?? "") === `/chat?aluno=${camila}`);
  await card.getByRole("button", { name: /Colocar Camila .* em pausa/ }).click();
  const dialog = owner.getByRole("dialog");
  await dialog.getByLabel("Motivo").selectOption("ferias");
  await dialog.getByRole("button", { name: "Colocar em pausa" }).click();
  ok("pausa salva", await toast(owner, "Aluno em pausa."));
  ok("em pausa: sai do card", await card.getByText(/Camila/).waitFor({ state: "detached", timeout: 15000 }).then(() => true, () => false));
  await owner.goto(`${BASE}/alunos?q=Camila`);
  ok("lista de alunos mostra 'Em pausa'", await visible(owner.getByText("Em pausa")));
  await owner.screenshot({ path: `${OUT}/ausencia-02-lista.png`, fullPage: true });
  const { data: pause } = await admin.from("student_pauses").select("reason").eq("student_id", camila).single();
  ok("banco: motivo 'ferias' (sem saúde)", pause?.reason === "ferias");
  ok("sem erro de página", [...aluna.errors, ...owner.errors].length === 0, [...aluna.errors, ...owner.errors].join(" | "));
} catch (e) {
  ok("roteiro terminou", false, e.message);
} finally {
  await resetAbsence(admin, camila).catch(() => {});
  await resetCamilaSessions(admin).catch(() => {});
  await browser.close();
}
process.exit(fails ? 1 : 0);
