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
async function login(email, viewport = { width: 1440, height: 900 }) {
  const page = await (await browser.newContext({ viewport })).newPage();
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
// Camila (i=2 no seed): 2 % 4 !== 0 → sem grupo especial → health = null para o owner (sem ser o
// professor responsável e sem consentimento), mas ele continua podendo registrar triagem (base legal
// própria). Cenário exato do painel "Condições do aluno" sem nenhuma condição.
const { data: camila } = await admin.from("students").select("id, first_name, last_name").eq("organization_id", org.id).eq("first_name", "Camila").order("enrollment_number").limit(1).single();

const page = await login("owner.seed@example.com");

// --- 1. Bug relatado: "Editar" abria o treino em vez do cadastro. Lista → "⋯" com itens distintos. ---
await page.goto(`${BASE}/alunos?q=Bruno`); await settle(page);
const row = page.locator("table tbody tr").first();
const name = (await row.locator("td:first-child p").innerText()).trim();
await page.getByRole("button", { name: `Ações para ${name}` }).first().click();
const menu = page.getByRole("menu");
await menu.waitFor();
ok("menu: Editar cadastro", (await menu.getByRole("menuitem", { name: "Editar cadastro" }).count()) === 1);
ok("menu: Treinos", (await menu.getByRole("menuitem", { name: "Treinos" }).count()) === 1);
ok("menu: Triagem de saúde", (await menu.getByRole("menuitem", { name: "Triagem de saúde" }).count()) === 1);

// --- 2. "Editar cadastro" abre o cadastro do aluno (não o treino) ---
await menu.getByRole("menuitem", { name: "Editar cadastro" }).click();
let dialog = page.getByRole("dialog");
await dialog.waitFor();
ok("abre o cadastro do aluno", (await dialog.getByRole("heading", { name: "Editar aluno" }).count()) === 1);
ok("não navegou para /treinos/", !page.url().includes("/treinos/"));
const studentId = new URL(page.url()).searchParams.get("editar");
ok("id do aluno capturado da URL", !!studentId, studentId ?? "");
await page.keyboard.press("Escape");
await dialog.waitFor({ state: "hidden" }).catch(() => {});

// --- 3. "Treinos" continua abrindo a lista de treinos do aluno (ação distinta) ---
await page.getByRole("button", { name: `Ações para ${name}` }).first().click();
await page.getByRole("menu").getByRole("menuitem", { name: "Treinos" }).click();
await page.waitForURL(/\/alunos\/[0-9a-f-]+\/treinos/, { timeout: 15000 });
ok("Treinos abre a lista de treinos do aluno", page.url().includes(`/alunos/${studentId}/treinos`));

// --- 4. "Triagem de saúde" abre o cadastro já rolado até a seção ---
await page.goto(`${BASE}/alunos?q=Bruno`); await settle(page);
await page.getByRole("button", { name: `Ações para ${name}` }).first().click();
await page.getByRole("menu").getByRole("menuitem", { name: "Triagem de saúde" }).click();
dialog = page.getByRole("dialog");
await dialog.waitFor();
ok("URL com foco=triagem", page.url().includes("foco=triagem"));
const section = dialog.getByRole("heading", { name: "Triagem de sinais de alerta" });
await section.waitFor();
await page.waitForTimeout(1000); // 200ms de espera pela animação do Dialog + rolagem suave
const box = await section.boundingBox();
ok("seção de triagem rolada para perto do topo do modal", !!box && box.y < 260, JSON.stringify(box));

// Registrar pela entrada "Triagem de saúde": prova que dá para chegar e agir, de ponta a ponta.
const triage = dialog.getByRole("region", { name: "Triagem de sinais de alerta" });
await triage.getByRole("button", { name: "Registrar triagem" }).click();
const checkDlg = page.getByRole("dialog", { name: "Registrar triagem" });
await checkDlg.waitFor();
await checkDlg.getByLabel("Trauma recente (queda, acidente) com dor").check();
await checkDlg.getByRole("button", { name: "Salvar triagem" }).click();
ok("triagem registrada pelo atalho da lista", await toastWith(page, "Triagem registrada."));
await page.keyboard.press("Escape");
await dialog.waitFor({ state: "hidden" }).catch(() => {});

await page.goto(`${BASE}/treinos/novo?aluno=${studentId}`); await settle(page);
ok("aviso aparece no montador", (await page.getByText("Sinais de alerta relatados/observados sem liberação").count()) === 1);

// --- 5. Atalho no montador: "Registrar triagem" no painel "Condições do aluno", sem sair da tela ---
await page.goto(`${BASE}/treinos/novo?aluno=${camila.id}`); await settle(page);
const panel = page.getByRole("region", { name: "Condições do aluno" });
ok("painel aparece mesmo sem nenhuma condição (só pelo atalho de triagem)", (await panel.count()) === 1);
ok("mensagem de nenhuma condição", (await panel.getByText("Nenhuma condição especial registrada.").count()) === 1);
const shortcutBtn = panel.getByRole("button", { name: "Registrar triagem" });
ok("botão 'Registrar triagem' no painel", (await shortcutBtn.count()) === 1);
await shortcutBtn.click();
const inlineDlg = page.getByRole("dialog", { name: "Registrar triagem" });
await inlineDlg.waitFor();
await inlineDlg.getByLabel("Fraqueza ou dormência que está piorando (braço ou perna)").check();
await inlineDlg.getByRole("button", { name: "Salvar triagem" }).click();
ok("triagem registrada pelo atalho do montador", await toastWith(page, "Triagem registrada."));
const banner = page.getByText("Sinais de alerta relatados/observados sem liberação");
await banner.waitFor({ timeout: 10000 }).catch(() => {});
ok("aviso aparece no montador sem precisar navegar", (await banner.count()) === 1);
await page.screenshot({ path: `${OUT}/triagem-atalho-montador.png` });

ok("sem erros de página", page.errors.length === 0, page.errors.join(" | "));
await browser.close();
console.log(fails ? `${fails} falha(s)` : "tudo ok");
process.exit(fails ? 1 : 0);
