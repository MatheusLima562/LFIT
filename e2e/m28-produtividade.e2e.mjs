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
const { data: studs } = await admin.from("students").select("id, first_name, last_name").eq("organization_id", org.id).order("enrollment_number");
const S = (i) => ({ id: studs[i].id, name: `${studs[i].first_name} ${studs[i].last_name}` });
const { data: p0 } = await admin.from("training_plans").select("id, name").eq("student_id", S(0).id).eq("status", "active").single();
const exId = async (name) => (await admin.from("exercises").select("id").is("organization_id", null).eq("name", name).single()).data.id;

// Idempotente: remove o que este roteiro cria (no início, sobras de execuções interrompidas; no fim, sempre).
const plankId = await exId("Prancha frontal");
const startedAt = new Date().toISOString();
async function cleanup() {
  await admin.from("exercise_defaults").delete().eq("organization_id", org.id).eq("exercise_id", plankId);
  await admin.from("training_plans").delete().eq("organization_id", org.id).eq("student_id", S(3).id).eq("name", "Treino 2.8.4");
  await admin.from("training_plans").delete().eq("source_plan_id", p0.id).in("student_id", [S(1).id, S(4).id]);
}
await cleanup();
try {
const page = await login("owner.seed@example.com");
// Padrões da equipe num exercício LFit
await page.goto(`${BASE}/treinos/exercicios?editar=${await exId("Prancha frontal")}`); await settle(page);
const dlg = page.getByRole("dialog");
ok("mostra o padrão LFit", (await dlg.getByText(/Padrão LFit: 3 × 20–40 s/).count()) === 1);
await dlg.getByLabel("Séries", { exact: true }).fill("4");
await dlg.getByLabel("Mín.", { exact: true }).fill("30");
await dlg.getByLabel("Máx.", { exact: true }).fill("45");
await dlg.getByRole("button", { name: "Salvar" }).click();
ok("padrões salvos", await toastWith(page, "Contraindicações atualizadas"));
const { data: def } = await admin.from("exercise_defaults").select("sets, quantity_unit, quantity_min, quantity_max").eq("organization_id", org.id).eq("exercise_id", await exId("Prancha frontal")).single();
ok("camada da equipe gravada", def && def.sets === 4 && def.quantity_unit === "seconds" && Number(def.quantity_min) === 30, JSON.stringify(def));

// Montador: + Rápido e clique normal com padrões
await page.goto(`${BASE}/treinos/novo?aluno=${S(3).id}`); await settle(page);
await page.getByLabel("Nome do treino").fill("Treino 2.8.4");
await page.getByRole("button", { name: "Adicionar exercício" }).click();
const sheet = page.getByRole("dialog");
await sheet.getByLabel("Buscar exercício").fill("dead bug");
await sheet.getByRole("button", { name: /Adicionar Dead bug rápido/ }).click();
await page.waitForTimeout(400);
ok("+ Rápido mantém o painel aberto", await sheet.isVisible());
await sheet.getByLabel("Buscar exercício").fill("prancha frontal");
await sheet.getByRole("button", { name: /^Prancha frontal/ }).first().click();
await page.waitForTimeout(400);
ok("clique normal fecha o painel", !(await page.getByRole("dialog").isVisible().catch(() => false)));
const plank = page.locator("[role=tabpanel] li", { hasText: "Prancha frontal" }).first();
ok("item com os padrões da equipe", (await plank.getByLabel("Séries", { exact: true }).inputValue()) === "4" && (await plank.getByLabel("Segundos Mín.").inputValue()) === "30");

// Recolher/expandir todos
await page.getByRole("button", { name: "Recolher todos" }).click();
ok("recolhidos: resumo em uma linha", (await page.getByText(/4 × 30–45 s/).count()) === 1 && (await page.getByLabel("Séries", { exact: true }).count()) === 0);
await page.screenshot({ path: `${OUT}/01-recolhido.png`, fullPage: true });
await page.getByRole("button", { name: "Expandir todos" }).click();
ok("expandidos", (await page.getByLabel("Séries", { exact: true }).count()) === 2);

// Importar exercícios de um modelo (bi-set mantido)
await page.getByRole("button", { name: "Importar exercícios" }).click();
const imp = page.getByRole("dialog");
await imp.getByRole("combobox").click();
await page.getByRole("option", { name: "Hipertrofia ABC" }).click();
await imp.getByRole("checkbox", { name: "Crucifixo com halteres" }).waitFor();
await imp.getByRole("checkbox", { name: "Crucifixo com halteres" }).click();
await imp.getByRole("checkbox", { name: "Crossover na polia" }).click();
await imp.getByRole("button", { name: "Importar 2 exercícios" }).click();
ok("importado", await toastWith(page, "2 exercícios importados"));
ok("bi-set mantido", (await page.locator("[role=tabpanel]").getByText("Bi-set", { exact: true }).count()) === 1);
await page.screenshot({ path: `${OUT}/02-importado.png`, fullPage: true });
await page.getByRole("button", { name: "Salvar rascunho" }).click();
ok("salvo", await toastWith(page, "Treino salvo"));

// Cópia em massa: Coluna saudável (S0) para 2 alunos, rascunho, com prévia
await page.goto(`${BASE}/alunos/${S(0).id}/treinos`); await settle(page);
await page.getByRole("button", { name: `Mais ações para ${p0.name}` }).first().click();
await page.getByRole("menuitem", { name: "Copiar para alunos" }).click();
const bulk = page.getByRole("dialog");
for (const i of [1, 4]) {
  await bulk.getByPlaceholder("Buscar aluno").fill(S(i).first_name ?? S(i).name.split(" ")[0]);
  await bulk.getByRole("option", { name: S(i).name }).click();
}
ok("2 selecionados", (await bulk.getByText("2 alunos selecionados").count()) === 1);
await bulk.getByRole("button", { name: "Ver alertas por aluno" }).click();
await bulk.getByText("Alertas de contraindicação por aluno").or(bulk.getByText("Os alertas não bloqueiam")).first().waitFor();
ok("prévia por aluno", (await bulk.locator("li").count()) === 2);
await page.screenshot({ path: `${OUT}/03-previa.png` });
await bulk.getByRole("button", { name: "Copiar para 2 alunos" }).click();
ok("cópias criadas", await toastWith(page, "2 de 2 cópias criadas"));
ok("resultado por aluno", (await bulk.getByText(/Criado \(Rascunho\)/).count()) === 2);
await page.screenshot({ path: `${OUT}/04-resultado.png` });
const { count } = await admin.from("training_plans").select("id", { count: "exact", head: true }).eq("source_plan_id", p0.id).in("student_id", [S(1).id, S(4).id]).gte("created_at", startedAt);
ok("banco: 2 rascunhos copiados", count === 2);
for (const p of [page]) ok("sem erros de JS", p.errors.length === 0, p.errors.join(" | "));
} finally {
  await cleanup();
  const left = await admin.from("training_plans").select("id", { count: "exact", head: true }).eq("source_plan_id", p0.id).in("student_id", [S(1).id, S(4).id]);
  const leftDef = await admin.from("exercise_defaults").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("exercise_id", plankId);
  const leftPlan = await admin.from("training_plans").select("id", { count: "exact", head: true }).eq("student_id", S(3).id).eq("name", "Treino 2.8.4");
  ok("limpeza: nada criado pelo roteiro ficou no banco", left.count === 0 && leftDef.count === 0 && leftPlan.count === 0);
  await browser.close();
}
console.log(fails ? `${fails} falha(s)` : "Tudo ok");
