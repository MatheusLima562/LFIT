import "./_guard.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const BASE = process.env.BASE ?? "http://localhost:3000", OUT = process.env.OUT, PW = process.env.SEED_USER_PASSWORD;
const browser = await chromium.launch({ channel: "chrome" });
let fails = 0;
const ok = (n, c, e = "") => { console.log(`${c ? "✓" : "✗"} ${n}${e ? " — " + e : ""}`); if (!c) fails++; };
const settle = (p) => p.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
async function login(email, viewport = { width: 1440, height: 900 }, scheme = "light") {
  const page = await (await browser.newContext({ viewport, colorScheme: scheme })).newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.errors = errors;
  await page.goto(`${BASE}/entrar`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 30000 });
  return page;
}
const { createClient } = require("@supabase/supabase-js");
const asUser = async (email) => { const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } }); await c.auth.signInWithPassword({ email, password: PW }); return c; };
const tabCount = async (p, name) => Number((await p.getByRole("tab", { name: new RegExp(name) }).first().innerText()).match(/\d+/)[0]);
for (const email of ["owner.seed@example.com", "trainer1.seed@example.com"]) {
  const c = await asUser(email);
  const { data: counts } = await c.rpc("student_plan_counts").single();
  const now = new Date(); const d7 = new Date(now.getTime() - 7 * 86400000).toISOString(); const d30 = new Date(now.getTime() - 30 * 86400000).toISOString();
  const n7 = (await c.from("students").select("id", { count: "exact", head: true }).is("deleted_at", null).gte("created_at", d7)).count;
  const n30 = (await c.from("students").select("id", { count: "exact", head: true }).is("deleted_at", null).gte("created_at", d30)).count;
  const p = await login(email);
  await p.goto(`${BASE}/`); await settle(p);
  const tr = p.getByRole("region", { name: "Acompanhamento de alunos" });
  ok(`${email}: A vencer = Meus alunos`, (await tabCount(tr, "A vencer")) === Number(counts.expiring), `${await tabCount(tr, "A vencer")} vs ${counts.expiring}`);
  ok(`${email}: Vencidos = Meus alunos`, (await tabCount(tr, "Vencidos")) === Number(counts.expired));
  ok(`${email}: Sem treino = Meus alunos`, (await tabCount(tr, "Sem treino")) === Number(counts.no_plan), `${await tabCount(tr, "Sem treino")} vs ${counts.no_plan}`);
  const nw = p.getByRole("region", { name: "Novos alunos" });
  ok(`${email}: Novos 7/30 dias`, (await tabCount(nw, "7 dias")) === n7 && (await tabCount(nw, "30 dias")) === n30, `${await tabCount(nw, "7 dias")}/${n7} ${await tabCount(nw, "30 dias")}/${n30}`);
  // Treinos, engajamento, retenção (RPCs do dashboard, dias em São Paulo): os números da tela são os do banco.
  const { data: training, error: trainingError } = await c.rpc("get_dashboard_training_stats");
  const { data: eng, error: engError } = await c.rpc("get_dashboard_engagement_retention");
  ok(`${email}: RPCs do dashboard respondem`, !trainingError && !engError, trainingError?.message ?? engError?.message ?? "");
  const main = p.getByRole("main");
  const overview = p.getByRole("region", { name: "Visão geral" });
  for (const label of ["Treinos registrados", "Engajamento semanal", "Retenção"]) ok(`${email}: tile "${label}"`, (await overview.getByText(label, { exact: true }).count()) === 1);
  if (training) {
    ok(`${email}: Treinos registrados = banco`, (await overview.innerText()).includes(String(training.registered_30d)));
    const done = p.getByRole("region", { name: "Treinos concluídos" });
    ok(`${email}: Treinos concluídos hoje = banco`, (await done.getByText(`${training.completed_today_count} hoje`).count()) === 1);
  }
  for (const card of ["Treinos concluídos", "Treinos da semana", "Top 5 alunos"]) ok(`${email}: card "${card}"`, (await main.getByText(card, { exact: true }).count()) === 1);
  // Satisfação só com nota nos últimos 30 dias (o seed não tem nenhuma).
  ok(`${email}: Satisfação só com notas`, (await main.getByText("Satisfação dos alunos", { exact: true }).count()) === (eng?.satisfaction?.ratings > 0 ? 1 : 0));
  for (const gone of ["Avaliação física", "Vendas"]) ok(`${email}: sem "${gone}"`, (await main.getByText(gone, { exact: true }).count()) === 0);
  await p.getByRole("button", { name: "Personalizar" }).click();
  const sh = p.getByRole("dialog");
  await sh.waitFor();
  // Visão geral + 4 cards de cadastro + 3 de treino (+ Satisfação se houver nota); "Em breve" só Avaliação física e Vendas.
  const expectedSwitches = 8 + (eng?.satisfaction?.ratings > 0 ? 1 : 0);
  ok(`${email}: Personalizar só com os cards reais`, (await sh.getByRole("switch").count()) === expectedSwitches, String(await sh.getByRole("switch").count()));
  ok(`${email}: 'Em breve' só Avaliação física e Vendas`, (await sh.getByText("Avaliação física", { exact: true }).count()) === 1 && (await sh.getByText("Vendas", { exact: true }).count()) === 1 && (await sh.getByText("Satisfação dos alunos", { exact: true }).count()) === (eng?.satisfaction?.ratings > 0 ? 1 : 0));
  await p.keyboard.press("Escape");
  if (email.startsWith("owner")) await p.screenshot({ path: `${OUT}/inicio-real.png`, fullPage: true });
  ok(`${email}: sem erros`, p.errors.length === 0, p.errors.join(" | "));
}
const m = await login("owner.seed@example.com", { width: 390, height: 844 }, "dark");
await m.goto(`${BASE}/`); await settle(m);
const sw = await m.evaluate(() => document.documentElement.scrollWidth);
ok("mobile sem rolagem horizontal", sw <= 390, String(sw));
await m.screenshot({ path: `${OUT}/inicio-real-390.png`, fullPage: true });
// 375 px (iPhone SE/mini) com os cards novos.
await m.setViewportSize({ width: 375, height: 812 });
await m.reload(); await settle(m);
const sw375 = await m.evaluate(() => document.documentElement.scrollWidth);
ok("375 px sem rolagem horizontal", sw375 <= 375, String(sw375));
await m.screenshot({ path: `${OUT}/inicio-real-375.png`, fullPage: true });
await browser.close();
console.log(fails ? `${fails} falha(s)` : "tudo ok");
process.exit(fails ? 1 : 0);
