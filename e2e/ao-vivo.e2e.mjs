import "./_guard.mjs";
import { waitLoggedIn } from "./_login.mjs";
import { resetLiveNotice, seedIds } from "./_fixtures.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const { createClient } = require("@supabase/supabase-js");
const BASE = process.env.BASE ?? "http://localhost:3000", OUT = process.env.OUT, PW = process.env.SEED_USER_PASSWORD;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const browser = await chromium.launch({ channel: "chrome" });
let fails = 0;
const ok = (n, c, e = "") => { console.log(`${c ? "✓" : "✗"} ${n}${e ? " — " + e : ""}`); if (!c) fails++; };
const overlap = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// AO VIVO a 375 px (precisa da migration 20261119120000): aluna inicia o treino → aviso de transparência → série feita
// → professor vê no Início (nome, progresso, sem saúde) → "Enviar mensagem" → aluna vê o banner na execução sem cobrir
// "Feita". Idempotente: apaga a sessão e a mensagem criadas (marca única desta execução).
const MARK = `ao-vivo-${Date.now().toString(36)}`;
const login = async (path, email, viewport = { width: 375, height: 812 }) => {
  const page = await (await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 })).newPage();
  page.errors = []; page.on("pageerror", (e) => page.errors.push(e.message));
  await page.goto(`${BASE}${path === "/" ? "/entrar" : "/aluno/entrar"}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Entrar" }).click();
  await waitLoggedIn(page, `${BASE}${path}`);
  return page;
};
let sessionId = null;
let aluna = null;
try {
  // Dados próprios (A4): o aviso de transparência volta a "não visto" para o roteiro passar em qualquer ordem.
  resetLiveNotice((await seedIds(admin)).camila);
  aluna = await login("/aluno", "aluno.seed@example.com");
  // Depois do f3 pode haver um treino aberto ("Retomar treino"): usa ele e não o apaga no fim.
  const resume = aluna.getByRole("link", { name: "Retomar treino" });
  const resuming = (await resume.count()) > 0;
  await (resuming ? resume.first() : aluna.getByRole("button", { name: "Iniciar treino" }).first()).click();
  await aluna.waitForURL(/\/aluno\/treino\/[0-9a-f-]+/, { timeout: 20000 });
  if (!resuming) sessionId = aluna.url().split("/treino/")[1].split("?")[0];
  await aluna.getByText("Seu professor acompanha o treino").waitFor({ timeout: 15000 });
  ok("aviso de transparência no primeiro treino", true);
  await aluna.getByRole("button", { name: "Entendi" }).click();
  await aluna.getByRole("button", { name: "Série 1: Feita" }).first().click();
  await aluna.waitForTimeout(3000); // fila + primeiro batimento

  // Professor responsável da Camila do app (aluno.seed) é o Caio = trainer2.
  const prof = await login("/", "trainer2.seed@example.com");
  const card = prof.locator("section[aria-labelledby='card-live']");
  await card.getByRole("heading", { name: /Treinando agora/ }).waitFor({ timeout: 15000 });
  await card.getByText("Camila").first().waitFor({ timeout: 35000 });
  ok("professor vê a aluna treinando com progresso", /\d+\/\d+ exercícios/.test(await card.innerText()));
  ok("card sem dado de saúde", !/dor|RPE|feedback|grupo|condição/i.test(await card.locator("ul").first().innerText()));
  ok("Início sem rolagem horizontal", await prof.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await prof.screenshot({ path: `${OUT}/ao-vivo-01-inicio.png`, fullPage: true });

  await card.getByRole("link", { name: /Enviar mensagem para Camila/ }).click();
  await prof.waitForURL(/\/chat\?aluno=/);
  await prof.getByRole("textbox").last().fill(`Mandou bem! ${MARK}`);
  await prof.keyboard.press("Enter");
  await prof.waitForTimeout(1500);

  const banner = aluna.locator("section", { hasText: "Mensagem de" });
  await banner.waitFor({ timeout: 70000 });
  ok("aluna vê a mensagem na execução", (await banner.innerText()).includes(MARK));
  const feita = await aluna.getByRole("button", { name: /Série \d+: Feita/ }).first().boundingBox();
  ok("banner não cobre 'Feita'", !overlap(await banner.boundingBox(), feita));
  await aluna.screenshot({ path: `${OUT}/ao-vivo-02-banner.png`, fullPage: true });
  ok("sem erro de página", [...aluna.errors, ...prof.errors].length === 0, [...aluna.errors, ...prof.errors].join(" | "));
} catch (e) {
  if (aluna) await aluna.screenshot({ path: `${OUT}/ao-vivo-erro-aluna.png`, fullPage: true }).catch(() => {});
  ok("roteiro terminou", false, e.message);
} finally {
  if (sessionId) await admin.from("workout_sessions").delete().eq("id", sessionId);
  await admin.from("chat_messages").delete().like("body", `%${MARK}%`);
  await browser.close();
}
process.exit(fails ? 1 : 0);
