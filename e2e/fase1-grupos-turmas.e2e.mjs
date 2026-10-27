import "./_guard.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const BASE = process.env.BASE ?? "http://localhost:3000", OUT = process.env.OUT, PW = process.env.SEED_USER_PASSWORD;
const browser = await chromium.launch({ channel: "chrome" });
let fails = 0;
const ok = (n, c, e = "") => { console.log(`${c ? "✓" : "✗"} ${n}${e ? " — " + e : ""}`); if (!c) fails++; };
const settle = (p) => p.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
// Espera por um aviso com o texto esperado (não o último da pilha, que pode ser antigo).
const toastWith = async (p, text) => { await p.locator("[data-sonner-toast]", { hasText: text }).last().waitFor({ timeout: 15000 }).catch(() => {}); return (await p.locator("[data-sonner-toast]", { hasText: text }).count()) > 0; };
async function login(email) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(`${BASE}/entrar`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 20000 });
  return page;
}
const page = await login("owner.seed@example.com");
const CLASS = `Pilates noite ${String(Date.now()).slice(-4)}`;
const NAME = `Dor no Quadril ${String(Date.now()).slice(-4)}`;

// Grupos
await page.getByRole("navigation", { name: "Menu principal" }).getByRole("button", { name: "Alunos" }).click();
await page.getByRole("link", { name: "Grupos especiais" }).click();
await page.waitForURL(/\/alunos\/grupos/); await settle(page);
ok("grupos listados (seed)", (await page.locator("li", { hasText: "Dor na Coluna" }).count()) === 1);
await page.screenshot({ path: `${OUT}/01-grupos.png` });
await page.getByRole("button", { name: "Novo grupo" }).click();
const dlg = page.getByRole("dialog");
await dlg.getByLabel("Nome do grupo").fill(NAME);
await dlg.getByRole("radio", { name: "Cor #2f80ed" }).click();
await page.waitForTimeout(200); await page.screenshot({ path: `${OUT}/02-novo-grupo.png` });
await dlg.getByRole("button", { name: "Criar grupo" }).click();
ok("grupo criado", await toastWith(page, "criado"));
await page.getByRole("button", { name: "Novo grupo" }).click();
await dlg.getByLabel("Nome do grupo").fill(NAME.toUpperCase());
await dlg.getByRole("button", { name: "Criar grupo" }).click();
ok("nome duplicado recusado", await dlg.getByText("Já existe um grupo com esse nome").waitFor({ timeout: 15000 }).then(() => true, () => false));
await dlg.getByRole("button", { name: "Cancelar" }).click();
await page.getByRole("button", { name: `Editar grupo: ${NAME}` }).click();
await dlg.getByLabel("Nome do grupo").fill(`${NAME} (renomeado)`);
await dlg.getByRole("button", { name: "Salvar" }).click();
ok("grupo renomeado", await toastWith(page, "atualizado"));
await page.getByRole("button", { name: `Excluir ${NAME} (renomeado)` }).click();
await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();
ok("grupo sem alunos excluído", await toastWith(page, "excluído"));
// Excluir grupo com alunos pede o nome
await page.getByRole("button", { name: "Excluir Dor no Joelho" }).click();
const adlg = page.getByRole("alertdialog");
ok("grupo com alunos exige digitar o nome", await adlg.getByRole("button", { name: "Excluir" }).isDisabled());
await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/03-excluir-grupo.png` });
await adlg.getByRole("button", { name: "Cancelar" }).click();
// Link para a lista filtrada
await page.locator("li", { hasText: "Dor na Coluna" }).getByRole("link").click();
await page.waitForURL(/\/alunos\?grupo=/);
ok("contagem do grupo leva à lista filtrada", true);

// Turmas
await page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Turmas" }).click();
await page.waitForURL(/\/turmas/); await settle(page);
await page.screenshot({ path: `${OUT}/04-turmas.png` });
await page.getByRole("button", { name: "Nova turma" }).click();
await dlg.getByLabel("Nome da turma").fill(CLASS);
await dlg.getByLabel("Professor responsável").click(); await page.getByRole("option", { name: "Caio Exemplo" }).click();
await dlg.getByRole("button", { name: "Criar turma" }).click();
ok("turma criada", await toastWith(page, "criada"));
await page.locator("li", { hasText: CLASS }).getByRole("button", { name: "Gerenciar alunos" }).click();
const sheet = page.getByRole("dialog");
await sheet.getByPlaceholder("Buscar aluno para incluir…").fill("ana");
await page.waitForTimeout(1200);
const cand = sheet.getByRole("option").first();
const candName = (await cand.innerText()).split("\n")[0].trim();
await cand.click();
ok(`incluir aluno (${candName})`, await toastWith(page, "incluído"));
await sheet.getByRole("list", { name: "Alunos" }).getByText(candName).waitFor({ timeout: 15000 }).catch(() => {});
ok("aluno aparece na turma", (await sheet.getByRole("list", { name: "Alunos" }).innerText()).includes(candName));
await page.screenshot({ path: `${OUT}/05-membros.png` });
await sheet.getByRole("button", { name: `Remover ${candName} da turma` }).click();
ok("remover aluno", await toastWith(page, "removido"));
await page.keyboard.press("Escape");
await page.getByRole("button", { name: `Excluir ${CLASS}` }).click();
await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();
ok("turma excluída", await toastWith(page, "excluída"));

// Professor
const tp = await login("trainer1.seed@example.com");
await tp.goto(`${BASE}/turmas`); await settle(tp);
const cards = tp.locator("main li");
const editable = await tp.getByRole("button", { name: "Gerenciar alunos" }).count();
ok("professor só edita a própria turma", (await cards.count()) === 2 && editable === 1, `${await cards.count()} turmas, ${editable} editável`);
await tp.goto(`${BASE}/alunos/grupos`); await settle(tp);
ok("professor não vê botão de excluir grupo", (await tp.getByRole("button", { name: /^Excluir / }).count()) === 0);
const d = await (await browser.newContext({ colorScheme: "dark", viewport: { width: 1440, height: 900 } })).newPage();
await d.context().addCookies(await page.context().cookies());
await d.goto(`${BASE}/turmas`); await settle(d); await d.screenshot({ path: `${OUT}/06-turmas-escuro.png` });
const m = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await m.context().addCookies(await page.context().cookies());
await m.goto(`${BASE}/alunos/grupos`); await settle(m);
ok("mobile sem overflow", (await m.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
await m.screenshot({ path: `${OUT}/07-grupos-mobile.png` });
await browser.close();
console.log(fails ? `\n${fails} falha(s)` : "\nTudo ok");
