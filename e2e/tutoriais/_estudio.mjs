/**
 * Estúdio dos vídeos de tutorial: sobe (ou reusa) o `next start` na porta 3100, faz login com um usuário FICTÍCIO
 * do seed e grava o roteiro em 1280×720 com cursor visível, destaque antes de cada clique e pausas para o espectador
 * acompanhar. Gera <saida>/<nome>.webm e <nome>.srt (legendas pelo tempo real de cada passo).
 * Só roda no lfit-dev (trava do ../_guard.mjs). Nunca use credenciais reais.
 */
import "../_guard.mjs";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { iniciarGravacao } from "./_gravador.mjs";
import { duracaoWebm, montarSrt } from "./_midia.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const { createClient } = require("@supabase/supabase-js");

export const BASE = process.env.BASE ?? "http://localhost:3100";
const LARGURA = 1280;
const ALTURA = 720;
// Chaves de TESTE do Turnstile (públicas, da Cloudflare), as mesmas dos roteiros e2e.
const TURNSTILE_TESTE = { NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA", TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA" };

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function servidorNoAr() {
  try {
    return (await fetch(`${BASE}/entrar`, { redirect: "manual" })).status < 500;
  } catch {
    return false;
  }
}

/** Usa o servidor que já estiver no ar; senão sobe a build de produção (`npm run build` antes). */
async function garantirServidor() {
  if (await servidorNoAr()) return null;
  const porta = new URL(BASE).port || "3100";
  if (!existsSync(".next/BUILD_ID")) throw new Error("Sem build de produção: rode `npm run build` antes.");
  console.log(`Subindo next start na porta ${porta}…`);
  const proc = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", porta], {
    env: { ...process.env, ...TURNSTILE_TESTE },
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    if (await servidorNoAr()) return proc;
    await espera(1000);
  }
  proc.kill();
  throw new Error(`O servidor não respondeu em ${BASE}.`);
}

// Cursor (círculo que segue o mouse e pulsa no clique), destaque do alvo e legenda opcional na tela.
// Tudo com pointer-events: none, acima de qualquer diálogo, e recriado a cada página carregada.
const SCRIPT_DA_PAGINA = () => {
  const instalar = () => {
    if (document.getElementById("__tut-cursor")) return;
    const css = document.createElement("style");
    css.textContent = `
      #__tut-cursor{position:fixed;left:0;top:0;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;
        background:rgba(24,24,27,.28);border:2px solid #fff;box-shadow:0 0 0 1.5px rgba(24,24,27,.75),0 2px 6px rgba(0,0,0,.25);
        z-index:2147483647;pointer-events:none;opacity:0;transition:opacity .2s}
      .__tut-pulso{position:fixed;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;border:3px solid rgba(24,24,27,.6);
        z-index:2147483646;pointer-events:none;animation:__tut-pulso .55s ease-out forwards}
      @keyframes __tut-pulso{from{transform:scale(.6);opacity:1}to{transform:scale(2.6);opacity:0}}
      #__tut-destaque{position:fixed;border-radius:10px;border:3px solid #f5b400;box-shadow:0 0 0 6px rgba(245,180,0,.25);
        z-index:2147483645;pointer-events:none;transition:opacity .25s}
      #__tut-legenda{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:880px;padding:10px 18px;
        border-radius:10px;background:rgba(24,24,27,.86);color:#fff;font:500 20px/1.35 system-ui,sans-serif;text-align:center;
        z-index:2147483644;pointer-events:none}`;
    document.head.appendChild(css);
    const cursor = document.createElement("div");
    cursor.id = "__tut-cursor";
    document.body.appendChild(cursor);
    const mover = (e) => {
      cursor.style.opacity = "1";
      cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    };
    document.addEventListener("mousemove", mover, true);
    document.addEventListener("mousedown", (e) => {
      mover(e);
      const p = document.createElement("div");
      p.className = "__tut-pulso";
      p.style.left = `${e.clientX}px`;
      p.style.top = `${e.clientY}px`;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 600);
    }, true);
  };
  if (document.body) instalar();
  else document.addEventListener("DOMContentLoaded", instalar);
};

function criarEstudio(page, { legendaNaTela }) {
  let mouse = { x: LARGURA / 2, y: ALTURA / 2 };

  async function moverPara(x, y) {
    const dist = Math.hypot(x - mouse.x, y - mouse.y);
    const passos = Math.max(12, Math.min(40, Math.round(dist / 22)));
    for (let i = 1; i <= passos; i++) {
      const t = i / passos;
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; // ease-in-out
      await page.mouse.move(mouse.x + (x - mouse.x) * e, mouse.y + (y - mouse.y) * e);
      await page.waitForTimeout(16);
    }
    mouse = { x, y };
  }

  async function destacar(caixa) {
    await page.evaluate(({ x, y, width, height }) => {
      let d = document.getElementById("__tut-destaque");
      if (!d) {
        d = document.createElement("div");
        d.id = "__tut-destaque";
        document.body.appendChild(d);
      }
      Object.assign(d.style, { left: `${x - 5}px`, top: `${y - 5}px`, width: `${width + 10}px`, height: `${height + 10}px`, opacity: "1" });
    }, caixa);
  }

  const apagarDestaque = () => page.evaluate(() => document.getElementById("__tut-destaque")?.remove()).catch(() => {});

  /** Rola até o alvo (suave), leva o cursor até ele e destaca. */
  async function chegar(alvo, { segurar = 700 } = {}) {
    await alvo.waitFor({ state: "visible", timeout: 15000 });
    await alvo.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" }));
    await page.waitForTimeout(450);
    const caixa = await alvo.boundingBox();
    if (!caixa) throw new Error(`Alvo sem posição na tela: ${alvo}`);
    await moverPara(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
    await destacar(caixa);
    await page.waitForTimeout(segurar);
  }

  return {
    page,
    /** Abre uma tela pelo endereço (use no começo; depois prefira clicar, como o usuário faria). */
    async irPara(rota) {
      await page.goto(`${BASE}${rota}`);
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      await page.mouse.move(mouse.x + 1, mouse.y);
      await page.waitForTimeout(400);
    },
    /** Leva o cursor, destaca e clica; depois espera a tela reagir. */
    async clicar(alvo, { depois = 1000 } = {}) {
      await chegar(alvo);
      await apagarDestaque();
      await alvo.click();
      await page.waitForLoadState("domcontentloaded").catch(() => {}); // telas com conexão aberta nunca ficam "networkidle"
      await page.waitForTimeout(depois);
    },
    /** Clica no campo, apaga o que houver e digita devagar (letra a letra). */
    async digitar(alvo, texto, { atraso = 75 } = {}) {
      await chegar(alvo, { segurar: 400 });
      await apagarDestaque();
      await alvo.click();
      await alvo.fill("");
      await alvo.pressSequentially(texto, { delay: atraso });
      await page.waitForTimeout(600);
    },
    /** Só aponta: cursor + destaque, sem clicar. */
    async apontar(alvo, ms = 1600) {
      await chegar(alvo, { segurar: ms });
      await apagarDestaque();
    },
    async esperar(ms) {
      await page.waitForTimeout(ms);
    },
    async tecla(nome) {
      await page.keyboard.press(nome);
      await page.waitForTimeout(800);
    },
    async legenda(texto) {
      if (!legendaNaTela) return;
      await page.evaluate((t) => {
        let el = document.getElementById("__tut-legenda");
        if (!el) {
          el = document.createElement("div");
          el.id = "__tut-legenda";
          document.body.appendChild(el);
        }
        el.textContent = t;
        el.style.display = t ? "" : "none";
      }, texto).catch(() => {});
    },
  };
}

async function login(page, email) {
  await page.goto(`${BASE}/entrar`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(process.env.SEED_USER_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 30000 });
}

/** Tempo de leitura da legenda antes da ação: ~45 ms por caractere, entre 1 e 2,4 s. */
const leitura = (texto) => Math.min(2400, Math.max(1000, texto.length * 45));

/**
 * Grava um roteiro. `roteiro`: { titulo, usuario, loginNoVideo?, inicio?, preparar?, limpar?, passos: [{ legenda, acao, pausa? }] }.
 * preparar/limpar recebem { admin, org } (limpam o que o roteiro cria — roteiros idempotentes).
 */
export async function gravar(nome, roteiro, { saida = "tutoriais-video", legendaNaTela = false } = {}) {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const { data: org, error } = await admin.from("organizations").select("id").eq("slug", "studio-exemplo").single();
  if (error || !org) throw new Error("Organização do seed (studio-exemplo) não encontrada: rode `npm run db:seed`.");
  const contexto = { admin, org };

  const servidor = await garantirServidor();
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    await roteiro.limpar?.(contexto);
    await roteiro.preparar?.(contexto);
    await admin.from("rate_limits").delete().neq("key", "");

    const ctx = await browser.newContext({ viewport: { width: LARGURA, height: ALTURA }, locale: "pt-BR", timezoneId: "America/Sao_Paulo", colorScheme: "light" });
    await ctx.addInitScript(SCRIPT_DA_PAGINA);
    const page = await ctx.newPage();
    const erros = [];
    page.on("pageerror", (e) => erros.push(e.message));

    // Fora do vídeo: login (a menos que o roteiro mostre o login) e a tela inicial.
    if (!roteiro.loginNoVideo) await login(page, roteiro.usuario);
    const v = criarEstudio(page, { legendaNaTela });
    await v.irPara(roteiro.inicio ?? (roteiro.loginNoVideo ? "/entrar" : "/"));

    const gravacao = await iniciarGravacao(browser, page, { largura: LARGURA, altura: ALTURA });
    const t0 = Date.now();
    const legendas = [];
    await page.waitForTimeout(800);
    for (const [i, passo] of roteiro.passos.entries()) {
      const inicio = Date.now() - t0;
      await v.legenda(passo.legenda);
      await page.waitForTimeout(leitura(passo.legenda));
      try {
        await passo.acao(v, contexto);
      } catch (e) {
        mkdirSync(saida, { recursive: true });
        const captura = path.join(saida, `${nome}-erro.png`);
        await page.screenshot({ path: captura }).catch(() => {});
        const js = erros.length ? `\nErros de JS na página:\n- ${erros.join("\n- ")}` : "";
        throw new Error(`Passo ${i + 1} ("${passo.legenda}") falhou: ${e.message.split("\n")[0]} (tela em ${captura})${js}`);
      }
      await page.waitForTimeout(passo.pausa ?? 1400);
      legendas.push({ inicio, fim: Date.now() - t0 - 80, texto: passo.legenda });
    }
    await v.legenda("");
    await page.waitForTimeout(1200);
    const webm = await gravacao.parar();
    await ctx.close();

    mkdirSync(saida, { recursive: true });
    const arquivoVideo = path.join(saida, `${nome}.webm`);
    const arquivoSrt = path.join(saida, `${nome}.srt`);
    writeFileSync(arquivoVideo, webm);
    writeFileSync(arquivoSrt, montarSrt(legendas));
    if (erros.length) console.warn(`Aviso: erros de JS na página durante a gravação:\n- ${erros.join("\n- ")}`);
    return { arquivoVideo, arquivoSrt, bytes: webm.length, duracaoMs: duracaoWebm(webm), relogioMs: Date.now() - t0, tipo: gravacao.tipo, passos: legendas.length };
  } finally {
    try {
      await roteiro.limpar?.(contexto);
    } catch (e) {
      console.error(`Limpeza falhou: ${e.message}`);
    }
    await browser.close();
    servidor?.kill();
  }
}
