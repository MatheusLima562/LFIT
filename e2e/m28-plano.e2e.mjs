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
const future = (d) => { const x = new Date(Date.now() + d * 86400000); return x.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }); };

const page = await login("owner.seed@example.com");
// Meus alunos com plano sem expiração (infinity) não quebra
await page.goto(`${BASE}/alunos`); await settle(page);
ok("Meus alunos carrega com plano sem expiração", (await page.getByText("Sem data de expiração").count()) >= 1 && page.errors.length === 0, page.errors.join("|"));

// Abas do aluno com agendado (S4) e sem expiração (S6)
await page.goto(`${BASE}/alunos/${S(4).id}/treinos`); await settle(page);
const tabs = page.getByRole("navigation", { name: "Treinos do aluno por período" });
ok("abas com contagem", (await tabs.getByRole("link", { name: /Futuros\s*1/ }).count()) === 1 && (await tabs.getByRole("link", { name: /Atuais\s*1/ }).count()) === 1);
await tabs.getByRole("link", { name: /Futuros/ }).click(); await page.waitForURL(/aba=futuros/); await settle(page);
ok("Futuros mostra o agendado", (await page.getByText("Agendado", { exact: true }).count()) === 1);
await page.screenshot({ path: `${OUT}/01-futuros.png` });
await page.goto(`${BASE}/alunos/${S(6).id}/treinos`); await settle(page);
ok("card: sem data de expiração + sessões", (await page.getByText(/sem data de expiração/).count()) >= 1 && (await page.getByText("36 sessões previstas", { exact: false }).count()) === 1);

// Novo treino: padrão do professor, sem expiração, sessões inválidas, agendar
await page.goto(`${BASE}/treinos/novo?aluno=${S(3).id}`); await settle(page);
const trainerSel = await page.getByRole("combobox", { name: "Professor do plano" }).innerText();
ok("professor do plano = responsável do aluno", trainerSel.includes("Rafael Exemplo"), trainerSel);
await page.getByLabel("Nome do treino").fill("Treino agendado 2.8.1");
await page.getByRole("textbox", { name: "Início" }).fill(future(10));
await page.getByRole("switch", { name: "Sem data de expiração" }).click();
ok("fim desabilitado com sem expiração", await page.getByRole("textbox", { name: "Fim" }).isDisabled());
await page.getByLabel("Sessões previstas").fill("0");
await page.getByRole("button", { name: "Salvar rascunho" }).click();
ok("sessões inválidas acusadas", await page.getByText("Entre 1 e 500 sessões.").first().waitFor({ timeout: 5000 }).then(() => true, () => false));
await page.getByLabel("Sessões previstas").fill("24");
await page.screenshot({ path: `${OUT}/02-cabecalho.png`, fullPage: true });
ok("botão vira Agendar", (await page.getByRole("button", { name: "Agendar treino" }).count()) === 1);
await page.getByRole("button", { name: "Agendar treino" }).click();
await page.getByRole("alertdialog").getByRole("button", { name: "Agendar treino" }).click();
ok("agendado", await toastWith(page, "Treino agendado"));
await page.waitForURL(new RegExp(`/alunos/${S(3).id}/treinos`)); await settle(page);
ok("aparece em Futuros", (await page.getByRole("navigation", { name: "Treinos do aluno por período" }).getByRole("link", { name: /Futuros\s*1/ }).count()) === 1);

// Professor do plano: owner passa o plano da Ana (S0) para o trainer2
const { data: p0 } = await admin.from("training_plans").select("id").eq("student_id", S(0).id).eq("status", "active").single();
await page.goto(`${BASE}/treinos/${p0.id}/editar`); await settle(page);
await page.getByRole("combobox", { name: "Professor do plano" }).click();
await page.getByRole("option", { name: "Caio Exemplo" }).click();
await page.getByRole("button", { name: "Salvar alterações" }).click();
ok("professor do plano trocado", await toastWith(page, "Treino salvo"));
const t2 = await login("trainer2.seed@example.com");
await t2.goto(`${BASE}/treinos/${p0.id}/editar`); await settle(t2);
ok("trainer2 vê o nome do aluno", (await t2.getByText(S(0).name).count()) >= 1);
await t2.getByRole("tab", { name: /^B/ }).click();
ok("alerta restrito: nível + texto genérico", (await t2.getByText("Restrição de saúde deste aluno — consulte o professor responsável.").count()) >= 1);
const body = await t2.locator("body").innerText();
ok("sem condição/grupo/nota", !/Hérnia|Dor na Coluna|Coluna lombar|Flexão de quadril/.test(body));
await t2.screenshot({ path: `${OUT}/03-restrito.png`, fullPage: true });
await t2.goto(`${BASE}/alunos/${S(0).id}/treinos`); await settle(t2);
ok("trainer2 não abre o cadastro do aluno", (await t2.getByText(/404|não encontrad/i).count()) >= 1);

// Impressão com sem expiração
const { data: pNoEnd } = await admin.from("training_plans").select("id").eq("student_id", S(6).id).eq("status", "active").single();
await page.goto(`${BASE}/treinos/${pNoEnd.id}/imprimir`); await settle(page);
ok("impressão: sem data de expiração + sessões", /sem data de expiração/.test(await page.locator("article").innerText()) && /Sessões previstas/.test(await page.locator("article").innerText()));
for (const p of [page, t2]) ok("sem erros de JS", p.errors.length === 0, p.errors.join(" | "));
console.log(fails ? `${fails} falha(s)` : "Tudo ok");
await browser.close();
