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
const overlap = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// Assistente de IA a 375 px com PROVEDOR FALSO. O servidor precisa subir com AI_PROVIDER=fake
// (`AI_PROVIDER=fake npx next start -p 3100`) e a migration 20261119140000 aplicada. Liga a flag SÓ na org de exemplo
// do seed durante o roteiro e desliga no fim; apaga a sessão (as mensagens vão junto) e o aceite.
const { data: org } = await admin.from("organizations").select("id").eq("slug", "studio-exemplo").single();
let sessionId = null;
try {
  await admin.from("organizations").update({ ai_assistant_enabled: true }).eq("id", org.id);
  const page = await (await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true })).newPage();
  page.errors = []; page.on("pageerror", (e) => page.errors.push(e.message));
  await page.goto(`${BASE}/aluno/entrar`);
  await page.getByLabel("E-mail").fill("aluno.seed@example.com");
  await page.getByLabel("Senha", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Entrar" }).click();
  await waitLoggedIn(page, `${BASE}/aluno`);
  await page.getByRole("button", { name: "Iniciar treino" }).first().click();
  await page.waitForURL(/\/aluno\/treino\/[0-9a-f-]+/, { timeout: 20000 });
  sessionId = page.url().split("/treino/")[1].split("?")[0];

  await page.getByRole("button", { name: "Perguntar ao Assistente de IA" }).click();
  ok("identificado como Assistente de IA", (await page.getByRole("heading", { name: /Assistente de IA/ }).count()) === 1);
  await page.getByRole("button", { name: "Entendi e quero usar" }).click();
  const { data: consents } = await admin.from("ai_consents").select("version, accepted_at").limit(5);
  ok("aceite registrado com versão e data", (consents ?? []).some((c) => c.version && c.accepted_at));

  const input = page.getByPlaceholder("Pergunte sobre o exercício atual");
  await input.fill("Posso fazer 10 repetições?");
  await input.focus();
  // "Teclado aberto": a janela visível encolhe; o painel está no fluxo, então nada fica por cima.
  await page.setViewportSize({ width: 375, height: 380 });
  await input.scrollIntoViewIfNeeded();
  const enviar = page.getByRole("button", { name: "Enviar" });
  const eb = await enviar.boundingBox();
  ok("'Enviar' visível com o teclado aberto", eb && eb.y >= 0 && eb.y + eb.height <= 380, JSON.stringify(eb));
  const feita = await page.getByRole("button", { name: /Série \d+: Feita/ }).first().boundingBox();
  const panel = await page.locator("section[aria-labelledby='assistant-title']").boundingBox();
  ok("painel não cobre 'Feita'", !overlap(panel, feita));
  await enviar.click();
  await page.getByText("Resposta de teste do Assistente de IA").waitFor({ timeout: 30000 });
  ok("resposta do provedor falso na tela", true);
  await page.setViewportSize({ width: 375, height: 667 });

  await input.fill("senti uma pontada no joelho");
  await enviar.click();
  await page.getByText("Pare o exercício e aguarde seu professor.").waitFor({ timeout: 15000 });
  ok("segurança: resposta fixa e IA pausada", (await page.getByText("O Assistente de IA foi pausado neste treino").count()) === 1);
  const { data: st } = await admin.from("ai_session_state").select("alert_kind, paused_reason").eq("session_id", sessionId).single();
  ok("alerta para o AO VIVO", st?.alert_kind === "safety" && st?.paused_reason === "safety");
  ok("sem rolagem horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.screenshot({ path: `${OUT}/assistente-01.png`, fullPage: true });
  ok("sem erro de página", page.errors.length === 0, page.errors.join(" | "));
} catch (e) {
  ok("roteiro terminou", false, e.message);
} finally {
  if (sessionId) await admin.from("workout_sessions").delete().eq("id", sessionId);
  const { data: s } = await admin.from("students").select("id").eq("organization_id", org.id);
  await admin.from("ai_consents").delete().in("student_id", (s ?? []).map((x) => x.id));
  await admin.from("organizations").update({ ai_assistant_enabled: false }).eq("id", org.id);
  await browser.close();
}
process.exit(fails ? 1 : 0);
