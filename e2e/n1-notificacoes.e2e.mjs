import "./_guard.mjs";
import { waitLoggedIn } from "./_login.mjs";
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
const toastWith = async (p, text, timeout = 15000) => { await p.locator("[data-sonner-toast]", { hasText: text }).last().waitFor({ timeout }).catch(() => {}); return (await p.locator("[data-sonner-toast]", { hasText: text }).count()) > 0; };
const toastsText = async (p) => (await p.locator("[data-sonner-toast]").allInnerTexts()).join(" | ");

// N1: avisos dentro do app — "Nova mensagem no chat" e "Novo recado do seu professor", sem conteúdo, nome ou saúde.
const RUN = `${Date.now()}`;
const BODY = `Mensagem N1 ${RUN} — joelho dolorido`, BODY2 = `Na conversa ${RUN}`, STAFF_BODY = `Do aluno N1 ${RUN}`, RECADO = `Recado N1 ${RUN}`;

const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
const id = (email) => users.users.find((x) => x.email === email).id;
const { data: camila } = await admin.from("students").select("id, organization_id").eq("user_id", id("aluno.seed@example.com")).single();
const CAIO = id("trainer2.seed@example.com");
const staffMessage = (body) => admin.from("chat_messages").insert({ organization_id: camila.organization_id, student_id: camila.id, sender_role: "staff", sender_id: CAIO, body, client_msg_id: randomUUID() });

async function login(email, path, viewport) {
  const ctx = await browser.newContext({ viewport, ...(viewport.width < 500 ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  page.urls = []; page.on("framenavigated", (f) => f === page.mainFrame() && page.urls.push(f.url()));
  await page.goto(`${BASE}${path}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Entrar" }).click();
  await waitLoggedIn(page, path === "/aluno/entrar" ? `${BASE}/aluno` : `${BASE}/`);
  await settle(page);
  return page;
}

try {
  // --- Aluna (375 px) ----------------------------------------------------------------------------------------
  const sp = await login("aluno.seed@example.com", "/aluno/entrar", { width: 375, height: 812 });
  const nav = sp.getByRole("navigation", { name: "Navegação do app" });
  await nav.getByRole("link", { name: "Histórico" }).click();
  await sp.waitForURL(`${BASE}/aluno/historico`);
  await sp.waitForTimeout(4000); // canal do selo inscrito

  await staffMessage(BODY);
  ok("aluna fora do chat: toast 'Nova mensagem no chat'", await toastWith(sp, "Nova mensagem no chat"));
  ok("toast sem o conteúdo da mensagem", !(await toastsText(sp)).includes(RUN));
  ok("aba Chat com selo de não lida", (await nav.locator('a[href="/aluno/chat"]').getAttribute("aria-label")) === "Chat, 1 mensagem não lida");
  await sp.screenshot({ path: `${OUT}/n1-01-toast-mensagem.png` });

  await sp.locator("[data-sonner-toast]", { hasText: "Nova mensagem no chat" }).getByRole("button", { name: "Abrir" }).click();
  await sp.waitForURL(`${BASE}/aluno/chat`);
  await sp.getByText(BODY).first().waitFor({ timeout: 15000 });
  await sp.waitForTimeout(1500);
  const before = await sp.locator("[data-sonner-toast]", { hasText: "Nova mensagem no chat" }).count();
  await staffMessage(BODY2);
  await sp.getByText(BODY2).first().waitFor({ timeout: 15000 });
  await sp.waitForTimeout(3000);
  ok("dentro da conversa: sem toast de mensagem nova", (await sp.locator("[data-sonner-toast]", { hasText: "Nova mensagem no chat" }).count()) <= before);

  // Recado novo: marcador na aba Hoje + toast uma vez, sem o texto.
  const { data: ann } = await admin.from("trainer_announcements").insert({ organization_id: camila.organization_id, trainer_id: CAIO, student_id: camila.id, body: RECADO }).select("id").single();
  await sp.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); // como ao voltar ao app
  ok("recado novo: toast 'Novo recado do seu professor'", await toastWith(sp, "Novo recado do seu professor"));
  ok("toast sem o texto do recado", !(await toastsText(sp)).includes(RUN));
  ok("aba Hoje com marcador de recado", (await nav.locator('a[href="/aluno"]').getAttribute("aria-label")) === "Hoje, novo recado");
  await sp.waitForTimeout(800); // fim da animação de entrada (0,4 s)
  const toastBox = await sp.locator('[data-sonner-toast][data-front="true"]').boundingBox();
  const navBox = await nav.boundingBox();
  const bg = await sp.locator('[data-sonner-toast][data-front="true"]').evaluate((el) => getComputedStyle(el).backgroundColor);
  ok("aviso com fundo (não transparente)", bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent", bg);
  ok("no celular o aviso fica acima da barra de abas", toastBox && navBox && toastBox.y + toastBox.height <= navBox.y, `${toastBox?.y}+${toastBox?.height} × ${navBox?.y}`);
  await sp.screenshot({ path: `${OUT}/n1-02-recado.png` });
  await nav.locator('a[href="/aluno"]').click();
  await sp.waitForURL(`${BASE}/aluno`);
  ok("na Hoje: o recado aparece", await sp.getByText(RECADO).first().waitFor({ timeout: 15000 }).then(() => true, () => false));
  await sp.waitForTimeout(800);
  await nav.locator('a[href="/aluno/historico"]').click();
  await sp.waitForURL(`${BASE}/aluno/historico`);
  ok("recado visto: marcador some", (await nav.locator('a[href="/aluno"]').getAttribute("aria-label")) === null);
  await sp.reload();
  await settle(sp);
  await sp.waitForTimeout(2000);
  ok("recado já avisado: sem toast de novo ao recarregar", (await sp.locator("[data-sonner-toast]", { hasText: "Novo recado" }).count()) === 0);
  await admin.from("trainer_announcements").delete().eq("id", ann.id);

  // --- Professor (desktop): mensagem de aluno fora do /chat -----------------------------------------------------
  const caio = await login("trainer2.seed@example.com", "/entrar", { width: 1440, height: 900 });
  await caio.goto(`${BASE}/alunos`);
  await settle(caio);
  await caio.waitForTimeout(4000);
  await admin.from("chat_messages").insert({ organization_id: camila.organization_id, student_id: camila.id, sender_role: "student", sender_id: null, body: STAFF_BODY, client_msg_id: randomUUID() });
  ok("professor fora do chat: toast 'Nova mensagem no chat'", await toastWith(caio, "Nova mensagem no chat"));
  ok("toast do professor sem conteúdo nem nome", !(await toastsText(caio)).includes(RUN) && !(await toastsText(caio)).includes("Camila"));

  const leaks = [...sp.urls, ...caio.urls].filter((u) => decodeURIComponent(u).includes(RUN));
  ok("nada do conteúdo em URL", leaks.length === 0, leaks.join(" | "));
} finally {
  await admin.from("chat_messages").delete().eq("student_id", camila.id).like("body", `%${RUN}%`);
  await admin.from("trainer_announcements").delete().eq("body", RECADO);
  await browser.close();
}
if (fails) { console.log(`\n${fails} falha(s).`); process.exit(1); }
