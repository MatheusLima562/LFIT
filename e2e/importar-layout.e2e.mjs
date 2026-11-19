import "./_guard.mjs";
import { waitLoggedIn } from "./_login.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const BASE = process.env.BASE ?? "http://localhost:3000", OUT = process.env.OUT, PW = process.env.SEED_USER_PASSWORD;
const browser = await chromium.launch({ channel: "chrome" });
let fails = 0;
const ok = (n, c, e = "") => { console.log(`${c ? "✓" : "✗"} ${n}${e ? " — " + e : ""}`); if (!c) fails++; };

// Importação (/importar) a 375 px até a revisão: arquivo em Windows-1252 com acentos, sugestão de colunas, erros e
// avisos por linha, sem rolagem horizontal. NÃO clica em "Importar" (não cria alunos; não depende da RPC nova).
// Dados fictícios gerados aqui (example.com).
const csv = [
  "Nome Completo;E-mail;Celular;Data de Nascimento;Objetivo;Observações;Situação",
  "João Exemplo da Conceição;joao.import@example.com;(41) 99901-0287;31/12/1990;Força;;ativo",
  "Somentenome;so@example.com;;;;;",
  "Ana Exemplo;ana.import@example.com;123;;;;inativo",
].join("\r\n");
const latin1 = Buffer.from(csv, "latin1"); // Windows-1252 = Latin-1 para estes caracteres

const page = await (await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })).newPage();
page.errors = []; page.on("pageerror", (e) => page.errors.push(e.message));
const noHorizontalScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
try {
  await page.goto(`${BASE}/entrar`);
  await page.getByLabel("E-mail").fill("trainer1.seed@example.com");
  await page.getByLabel("Senha", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Entrar" }).click();
  await waitLoggedIn(page, `${BASE}/`);

  await page.goto(`${BASE}/importar`);
  await page.getByRole("heading", { name: "Importar alunos" }).waitFor();
  ok("passo 1 sem rolagem horizontal a 375 px", await noHorizontalScroll());
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar planilha-modelo" }).click()]);
  ok("planilha-modelo baixa", dl.suggestedFilename() === "modelo-importacao-alunos.csv");

  await page.locator("#import-file").setInputFiles({ name: "alunos.csv", mimeType: "text/csv", buffer: latin1 });
  await page.getByRole("heading", { name: "Confira as colunas" }).waitFor();
  ok("codificação detectada: Windows-1252", (await page.getByText("Windows-1252").count()) > 0);
  const selected = async (label) => page.getByLabel(label, { exact: false }).evaluate((s) => s.options[s.selectedIndex].text);
  ok("Nome → Nome Completo", (await selected("Nome (obrigatório)")) === "Nome Completo");
  ok("E-mail → E-mail", (await selected("E-mail (obrigatório)")) === "E-mail");
  ok("Observações com acento casou", (await selected("Observações")) === "Observações");
  ok("Status → Situação", (await selected("Status")) === "Situação");
  ok("acentos lidos certo no exemplo", (await page.getByText("Ex.: João Exemplo da Conceição").count()) > 0);
  ok("passo 2 sem rolagem horizontal", await noHorizontalScroll());
  await page.screenshot({ path: `${OUT}/importar-01-colunas.png`, fullPage: true });

  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("heading", { name: "Revisão" }).waitFor();
  ok("2 prontos, 1 com problema", (await page.getByText("2 alunos prontos para importar · 1 com problema").count()) === 1);
  ok("linha 3 sem sobrenome", (await page.getByText("Sem sobrenome").count()) > 0);
  ok("aviso de telefone na linha 4", (await page.getByText("telefone inválido").count()) > 0);
  ok("botão Importar 2 alunos", (await page.getByRole("button", { name: "Importar 2 alunos" }).count()) === 1);
  ok("passo 3 sem rolagem horizontal", await noHorizontalScroll());
  await page.screenshot({ path: `${OUT}/importar-02-revisao.png`, fullPage: true });
  ok("sem erro de página", page.errors.length === 0, page.errors.join(" | "));
} catch (e) {
  ok("roteiro terminou", false, e.message);
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
