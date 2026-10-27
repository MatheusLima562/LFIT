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
const page = await login("trainer1.seed@example.com");
await page.getByRole("navigation", { name: "Menu principal" }).getByRole("button", { name: "Treinos & Exercícios" }).click();
await page.getByRole("link", { name: "Exercícios" }).click();
await page.waitForURL(/\/treinos\/exercicios/); await settle(page);
ok("lista com exercícios globais", (await page.getByRole("table").getByRole("row").count()) > 25);
await page.screenshot({ path: `${OUT}/01-lista.png` });

await page.getByLabel("Buscar exercícios").fill("triceps");
await page.waitForURL(/q=triceps/); await settle(page);
ok("busca sem acento", (await page.getByRole("table").getByRole("link", { name: "Tríceps na polia" }).count()) === 1);
await page.getByLabel("Buscar exercícios").fill("");
await page.waitForURL((u) => !u.search.includes("q=")); await settle(page);

// Filtro por condição (seed: regras da equipe para Coluna lombar)
await page.getByRole("combobox", { name: "Contraindicado para" }).click();
await page.getByRole("option", { name: "Coluna lombar", exact: true }).click();
await page.waitForURL(/condicao=/); await settle(page);
ok("filtro por condição", (await page.getByRole("table").getByRole("link", { name: "Agachamento livre com barra" }).count()) === 1);
await page.screenshot({ path: `${OUT}/02-filtro-condicao.png` });
await page.getByRole("button", { name: "Limpar filtros" }).click();
await page.waitForURL((u) => !u.search.includes("condicao")); await settle(page);

// Ficha de um global + vídeo inexistente
await page.getByRole("link", { name: "Agachamento livre com barra" }).click();
const dlg = page.getByRole("dialog");
await dlg.waitFor();
ok("ficha mostra regra da equipe com nível e nota", (await dlg.getByText("Carga axial; preferir goblet (exemplo do seed)").count()) === 1 && (await dlg.getByText("Cautela").count()) >= 1);
await page.screenshot({ path: `${OUT}/03-ficha-global.png` });

// Editar contraindicações do global (camada da equipe)
await dlg.getByRole("link", { name: "Editar contraindicações" }).click();
await page.waitForURL(/editar=/); await settle(page);
await dlg.getByRole("button", { name: "Adicionar contraindicação" }).click();
await dlg.getByRole("combobox", { name: "Condição" }).last().click();
await page.getByRole("option", { name: "Joelho", exact: true }).click();
await dlg.getByLabel("Nota / justificativa").last().fill("Controlar profundidade");
await page.screenshot({ path: `${OUT}/04-editar-regras-global.png` });
await dlg.getByRole("button", { name: "Salvar" }).click();
ok("regras do global salvas", await toastWith(page, "Contraindicações atualizadas"));
await page.waitForURL(/ver=/); await settle(page);
ok("ficha reaberta com nova regra", (await page.getByRole("dialog").getByText("Controlar profundidade").count()) === 1);

// Personalizar
await page.getByRole("dialog").getByRole("button", { name: "Personalizar" }).click();
ok("personalizado", await toastWith(page, "personalizado"));
await page.waitForURL(/editar=/); await settle(page);
const f = page.getByRole("dialog");
ok("cópia editável com regras copiadas", (await f.getByLabel("Nome").inputValue()) === "Agachamento livre com barra" && (await f.getByLabel("Nota / justificativa").count()) === 2);
await f.getByLabel("Nome").fill("Agachamento livre (adaptado)");
await f.getByLabel("Link do vídeo (opcional)").fill("http://example.com");
await f.getByRole("button", { name: "Salvar" }).click();
ok("vídeo inválido recusado", (await f.getByText("Use um link https do YouTube ou do Vimeo").count()) === 1);
await f.getByLabel("Link do vídeo (opcional)").fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
await f.getByRole("button", { name: "Salvar" }).click();
ok("cópia salva", await toastWith(page, "Exercício atualizado"));
await page.waitForURL(/ver=/); await settle(page);
ok("ficha sem iframe antes do clique", (await page.locator("iframe").count()) === 0);
await page.getByRole("button", { name: "Carregar vídeo" }).click();
ok("iframe youtube-nocookie", (await page.locator("iframe[src*='youtube-nocookie.com/embed/dQw4w9WgXcQ']").count()) === 1);
await page.keyboard.press("Escape");
await page.waitForURL((u) => !u.search.includes("ver=")); await settle(page);
ok("global personalizado some da lista, cópia aparece",
  (await page.getByRole("link", { name: "Agachamento livre com barra", exact: true }).count()) === 0 &&
  (await page.getByRole("link", { name: "Agachamento livre (adaptado)" }).count()) === 1);

// Novo exercício
await page.getByRole("link", { name: "Novo exercício" }).click();
await page.waitForURL(/novo=1/);
const n = page.getByRole("dialog");
const NAME = `Remada cavalinho ${String(Date.now()).slice(-4)}`;
await n.getByRole("button", { name: "Novo exercício" }).click();
ok("validação nome/grupos", (await n.getByText("Escolha pelo menos um grupo muscular").count()) === 1);
await n.getByLabel("Nome").fill(NAME);
await n.getByRole("button", { name: "Dorsais" }).click();
await n.getByLabel("Equipamento").fill("Barra T");
await page.screenshot({ path: `${OUT}/05-novo.png` });
await n.getByRole("button", { name: "Novo exercício" }).click();
ok("novo criado", await toastWith(page, "Exercício criado"));
await page.waitForURL(/ver=/); await settle(page);
// Arquivar / restaurar
await page.getByRole("dialog").getByRole("button", { name: "Arquivar" }).click();
await page.getByRole("alertdialog").getByRole("button", { name: "Arquivar" }).click();
ok("arquivado", await toastWith(page, "arquivado"));
await settle(page);
ok("arquivado some da lista", (await page.getByRole("link", { name: NAME }).count()) === 0);
await page.goto(`${BASE}/treinos/exercicios?origem=archived`); await settle(page);
ok("aparece em Arquivados", (await page.getByRole("link", { name: NAME }).count()) === 1);

// Outro trainer não edita o exercício de trainer1
const p2 = await login("trainer2.seed@example.com");
await p2.goto(`${BASE}/treinos/exercicios?q=adaptado`); await settle(p2);
await p2.getByRole("link", { name: "Agachamento livre (adaptado)" }).click();
await p2.getByRole("dialog").waitFor();
ok("trainer2: sem Editar/Arquivar no exercício alheio",
  (await p2.getByRole("dialog").getByRole("link", { name: "Editar exercício" }).count()) === 0 &&
  (await p2.getByRole("dialog").getByRole("button", { name: "Arquivar" }).count()) === 0);

// Dark + mobile
const pm = await login("owner.seed@example.com", { width: 390, height: 844 }, "dark");
await pm.goto(`${BASE}/treinos/exercicios`); await settle(pm);
await pm.evaluate(() => document.documentElement.classList.add("dark"));
await pm.waitForTimeout(300);
const overflow = await pm.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
ok("mobile sem rolagem horizontal", !overflow);
await pm.screenshot({ path: `${OUT}/06-mobile-dark.png` });
await pm.getByRole("link", { name: "Leg press 45°" }).click();
await pm.getByRole("dialog").waitFor(); await pm.waitForTimeout(300);
await pm.screenshot({ path: `${OUT}/07-mobile-ficha.png` });

for (const p of [page, p2, pm]) ok(`sem erros de JS (${p === page ? "t1" : p === p2 ? "t2" : "mobile"})`, p.errors.length === 0, p.errors.join(" | "));
console.log(fails ? `${fails} falha(s)` : "Tudo ok");
await browser.close();
