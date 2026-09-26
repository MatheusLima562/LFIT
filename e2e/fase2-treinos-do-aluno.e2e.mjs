import "./_guard.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const BASE = process.env.BASE ?? "http://localhost:3000", OUT = process.env.OUT, PW = process.env.SEED_USER_PASSWORD;
const browser = await chromium.launch({ channel: "chrome" });
let fails = 0;
const ok = (n, c, e = "") => { console.log(`${c ? "✓" : "✗"} ${n}${e ? " — " + e : ""}`); if (!c) fails++; };
const settle = (p) => p.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
const toastWith = async (p, text) => { await p.locator("[data-sonner-toast]", { hasText: text }).last().waitFor({ timeout: 15000 }).catch(() => {}); return (await p.locator("[data-sonner-toast]", { hasText: text }).count()) > 0; };
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
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: org } = await admin.from("organizations").select("id").eq("slug", "studio-exemplo").single();
const { data: studs } = await admin.from("students").select("id, first_name, last_name, enrollment_number").eq("organization_id", org.id).order("enrollment_number");
const S = (i) => ({ id: studs[i].id, name: `${studs[i].first_name} ${studs[i].last_name}` });

const page = await login("owner.seed@example.com");
// Filtros em Meus alunos
await page.goto(`${BASE}/alunos`); await settle(page);
const nav = page.getByRole("navigation", { name: "Treino" });
ok("chips de treino com contagens", (await nav.getByRole("link", { name: /A vencer \(7 dias\)\s*1/ }).count()) === 1 && (await nav.getByRole("link", { name: /Vencidos\s*1/ }).count()) === 1);
await nav.getByRole("link", { name: /A vencer/ }).click();
await page.waitForURL(/treino=a_vencer/); await settle(page);
ok("filtro a vencer mostra o aluno certo", (await page.getByRole("table").getByText(S(4).name).count()) === 1 && (await page.getByRole("table").getByRole("row").count()) === 2);
await page.screenshot({ path: `${OUT}/01-alunos-a-vencer.png` });
await nav.getByRole("link", { name: /Vencidos/ }).click();
await page.waitForURL(/treino=vencido/); await settle(page);
ok("filtro vencidos", (await page.getByRole("table").getByText(S(1).name).count()) === 1 && (await page.getByText(/Venceu em/).count()) >= 1);
await nav.getByRole("link", { name: /Sem treino/ }).click();
await page.waitForURL(/treino=sem_treino/); await settle(page);
ok("filtro sem treino", (await page.getByRole("table").getByText(S(3).name).count()) === 1 && (await page.getByRole("table").getByText(S(0).name, { exact: true }).count()) === 0);

// Menu da linha → Treinos do aluno (S(3): sem treino, rascunho? não; S(12) tem rascunho)
await page.getByRole("button", { name: `Ações para ${S(3).name}` }).click();
await page.getByRole("menuitem", { name: "Treinos" }).click();
await page.waitForURL(new RegExp(`/alunos/${S(3).id}/treinos`)); await settle(page);
// Abas por URL desde a 2.8.1 (Atuais/Futuros/Anteriores/Todos).
ok("página de treinos do aluno (sem treino atual)", (await page.getByText("Nenhum treino atual").count()) === 1);
await page.screenshot({ path: `${OUT}/02-aluno-sem-treino.png` });

// Aplicar modelo com datas → rascunho → ativar
await page.getByRole("button", { name: "Aplicar modelo" }).click();
const d = page.getByRole("dialog");
await d.getByRole("option", { name: "Hipertrofia ABC" }).click();
// Datas relativas a hoje (São Paulo): início hoje → "Ativar treino" (início futuro viraria "Agendar").
const brDate = (offsetDays) => {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + offsetDays * 86400000));
  const [y, m, dd] = iso.split("-");
  return `${dd}/${m}/${y}`;
};
const START = brDate(0), END = brDate(60);
await d.getByLabel("Início").fill(START);
await d.getByLabel("Fim").fill(END);
await page.screenshot({ path: `${OUT}/03-aplicar-modelo.png` });
await d.getByRole("button", { name: "Aplicar" }).click();
ok("modelo aplicado", await toastWith(page, "Modelo aplicado"));
await page.waitForURL(/\/treinos\/[0-9a-f-]+\/editar/); await settle(page);
ok("rascunho com as datas", (await page.getByRole("textbox", { name: "Início" }).inputValue()) === START);
await page.getByRole("button", { name: "Ativar treino" }).click();
await page.getByRole("alertdialog").getByRole("button", { name: "Ativar treino" }).click();
ok("ativado", await toastWith(page, "Treino ativado"));
await page.waitForURL(new RegExp(`/alunos/${S(3).id}/treinos`)); await settle(page);
ok("aparece como ativo com período", (await page.getByText(`${START} – ${END}`).count()) === 1);

// Duplicar → rascunho; salvar como modelo; arquivar ativo
await page.getByRole("button", { name: "Mais ações para Hipertrofia ABC" }).first().click();
await page.getByRole("menuitem", { name: "Duplicar" }).click();
ok("duplicado", await toastWith(page, "Cópia criada"));
await page.waitForURL(/\/editar/); await settle(page);
ok("cópia em rascunho", (await page.getByText("Rascunho", { exact: true }).count()) >= 1 && (await page.getByLabel("Nome do treino").inputValue()).endsWith("(cópia)"));
await page.goto(`${BASE}/alunos/${S(3).id}/treinos`); await settle(page);
// Desde a 2.8.1 os rascunhos ficam na aba "Atuais" (padrão).
ok("rascunho listado em Atuais", (await page.getByText("Hipertrofia ABC (cópia)").count()) === 1);
const TPL = `Modelo do aluno ${String(Date.now()).slice(-4)}`;
await page.getByRole("button", { name: "Mais ações para Hipertrofia ABC (cópia)" }).click();
await page.getByRole("menuitem", { name: "Salvar como modelo" }).click();
await page.getByRole("dialog").getByLabel("Nome do modelo").fill(TPL);
await page.getByRole("dialog").getByRole("button", { name: "Salvar como modelo" }).click();
ok("modelo criado", await toastWith(page, "Modelo criado"));
await page.waitForURL(/\/editar/);
await page.goto(`${BASE}/alunos/${S(3).id}/treinos`); await settle(page);
await page.getByRole("button", { name: "Mais ações para Hipertrofia ABC" }).first().click();
await page.getByRole("menuitem", { name: "Arquivar" }).click();
ok("aviso de ficar sem treino", (await page.getByRole("alertdialog").getByText("O aluno fica sem treino ativo").count()) === 1);
await page.getByRole("alertdialog").getByRole("button", { name: "Arquivar" }).click();
ok("arquivado", await toastWith(page, "Treino arquivado"));
await settle(page);
await page.goto(`${BASE}/alunos/${S(3).id}/treinos?aba=anteriores`); await settle(page);
ok("vai para Anteriores", (await page.getByText("Hipertrofia ABC", { exact: true }).count()) >= 1);
await page.screenshot({ path: `${OUT}/04-aluno-historico.png`, fullPage: true });

// Modelos: lista, aplicar a aluno
await page.goto(`${BASE}/treinos/modelos`); await settle(page);
ok("modelos listados", (await page.getByText(TPL).count()) === 1 && (await page.getByText("Coluna saudável").count()) === 1);
await page.screenshot({ path: `${OUT}/05-modelos.png` });
await page.getByRole("button", { name: "Mais ações para Coluna saudável" }).click();
await page.getByRole("menuitem", { name: "Aplicar a aluno" }).click();
const d2 = page.getByRole("dialog");
await d2.getByPlaceholder("Buscar aluno").fill(S(5).first_name ?? S(5).name.split(" ")[0]);
await d2.getByRole("option", { name: S(5).name }).click();
await d2.getByRole("button", { name: "Aplicar" }).click();
ok("aplicado a aluno pelo modelo", await toastWith(page, "Modelo aplicado"));
await page.waitForURL(/\/editar/); await settle(page);
ok("rascunho do aluno certo", (await page.getByText(S(5).name).count()) >= 1);

// Visão geral
await page.goto(`${BASE}/treinos`); await settle(page);
ok("visão geral lista treinos ativos", (await page.getByRole("table").getByRole("row").count()) >= 4);
await page.screenshot({ path: `${OUT}/06-visao-geral.png` });

// Trainer: só vê os seus
const t2 = await login("trainer2.seed@example.com");
await t2.goto(`${BASE}/treinos`); await settle(t2);
const rows = await t2.getByRole("table").getByRole("row").count();
const { count } = await admin.from("training_plans").select("id, students!inner(trainer_id)", { count: "exact", head: true }).eq("status", "active").eq("students.trainer_id", (await admin.from("profiles").select("id").eq("full_name", "Caio Exemplo").single()).data.id);
ok("trainer2 vê só os treinos dos seus alunos", rows - 1 === count, `${rows - 1} vs ${count}`);
await t2.goto(`${BASE}/alunos/${S(0).id}/treinos`); await settle(t2);
ok("trainer2 não acessa aluno alheio (404)", (await t2.getByText(/404|não encontrad/i).count()) >= 1);

const pm = await login("owner.seed@example.com", { width: 390, height: 844 }, "dark");
await pm.goto(`${BASE}/alunos/${S(0).id}/treinos`); await settle(pm);
await pm.evaluate(() => document.documentElement.classList.add("dark")); await pm.waitForTimeout(300);
ok("mobile sem rolagem horizontal", !(await pm.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
await pm.screenshot({ path: `${OUT}/07-mobile-dark.png` });
await pm.goto(`${BASE}/alunos`); await settle(pm);
ok("mobile alunos sem rolagem", !(await pm.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
await pm.screenshot({ path: `${OUT}/08-mobile-alunos.png` });
for (const p of [page, t2, pm]) ok("sem erros de JS", p.errors.length === 0, p.errors.join(" | "));
console.log(fails ? `${fails} falha(s)` : "Tudo ok");
await browser.close();
