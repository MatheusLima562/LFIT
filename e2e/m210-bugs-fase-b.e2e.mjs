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
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
// Ana Duarte (seed): grupo "Dor na Coluna" → hérnia discal lombar, com regra "evitar" da equipe e "cautela"
// global aprovada para o mesmo exercício (Abdominal supra) — o cenário de duplicação do bug relatado.
const { data: org } = await admin.from("organizations").select("id").eq("slug", "studio-exemplo").single();
const { data: studs } = await admin.from("students").select("id").eq("organization_id", org.id).order("enrollment_number");
const ANA = studs[0].id;
const { data: plan0 } = await admin.from("training_plans").select("id").eq("student_id", ANA).eq("status", "active").single();

const page = await login("owner.seed@example.com");
await page.goto(`${BASE}/treinos/${plan0.id}/editar`); await settle(page);
const panel = page.getByRole("region", { name: "Condições do aluno" });
ok("painel de condições visível", (await panel.count()) === 1);

// Bug 1: "Coluna lombar" e "Hérnia discal lombar" têm Guia próprio; "Estenose foraminal (exemplo)"
// (condição própria da org, sem chave global) não deve mostrar botão, nem herdar o Guia da região.
const colunaItem = panel.locator("li").filter({ hasText: "Coluna lombar" });
await colunaItem.getByRole("button", { name: "Abrir o Guia: Coluna lombar" }).click();
let sheet = page.getByRole("dialog");
await sheet.waitFor();
ok("Coluna lombar abre o próprio Guia", (await sheet.getByRole("heading", { name: "Guia — Lombalgia inespecífica" }).count()) === 1);
await page.keyboard.press("Escape");
await sheet.waitFor({ state: "hidden" }).catch(() => {});

const herniaItem = panel.locator("li").filter({ hasText: "Hérnia discal lombar (intolerância à flexão)" });
await herniaItem.getByRole("button", { name: "Abrir o Guia: Hérnia discal lombar (intolerância à flexão)" }).click();
sheet = page.getByRole("dialog");
await sheet.waitFor();
ok("Hérnia discal lombar abre o próprio Guia", (await sheet.getByRole("heading", { name: "Guia — Hérnia discal lombar (intolerância à flexão)" }).count()) === 1);
await page.keyboard.press("Escape");
await sheet.waitFor({ state: "hidden" }).catch(() => {});

const estenoseItem = panel.locator("li").filter({ hasText: "Estenose foraminal (exemplo)" });
ok("Estenose foraminal (exemplo): sem botão de Guia", (await estenoseItem.getByRole("button", { name: /Abrir o Guia/ }).count()) === 0);
ok("Estenose foraminal (exemplo): mostra 'Sem Guia'", (await estenoseItem.getByText("Sem Guia").count()) === 1);
await page.screenshot({ path: `${OUT}/fase-b-condicoes.png` });

// Bug 2/3: adiciona "Abdominal supra" ao treino (regra "evitar" da equipe + "cautela" global aprovada
// para a mesma condição). Deve mostrar só UM alerta (o pior nível), com "Como adaptar:" antes da nota,
// e a regra mais branda como detalhe recolhido.
await page.getByRole("button", { name: "Adicionar exercício" }).click();
const picker = page.getByRole("dialog");
await picker.getByLabel("Buscar exercício").fill("abdominal");
await picker.getByRole("button", { name: /^Abdominal supra/ }).click();
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

const supraCard = page.locator('div[id^="item-"]').filter({ hasText: "Abdominal supra" });
ok("item Abdominal supra adicionado", (await supraCard.count()) === 1);
ok("um único selo de nível (Evitar)", (await supraCard.getByText("Evitar", { exact: true }).count()) === 1);
ok("nenhum selo de Cautela solto para este item", (await supraCard.getByText("Cautela", { exact: true }).count()) === 0);
ok("nota com 'Como adaptar:'", (await supraCard.getByText(/Como adaptar: Flexão repetida da coluna/).count()) === 1);
const detail = supraCard.locator("details");
ok("detalhe recolhido da regra global", (await detail.count()) === 1);
ok("resumo do detalhe cita 'Regra global: cautela'", (await detail.getByText("Regra global: cautela").count()) === 1);
await detail.locator("summary").click();
ok("detalhe expandido mostra a nota global com 'Como adaptar:'", (await detail.getByText(/Como adaptar: Isometrias: dead bug, prancha, Pallof press\./).count()) === 1);
await page.screenshot({ path: `${OUT}/fase-b-alerta-dedup.png` });

ok("sem erros de página", page.errors.length === 0, page.errors.join(" | "));
await browser.close();
console.log(fails ? `${fails} falha(s)` : "tudo ok");
process.exit(fails ? 1 : 0);
