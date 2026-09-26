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
const fs = require("node:fs");
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: org } = await admin.from("organizations").select("id").eq("slug", "studio-exemplo").single();
const listFolder = async (exId) => ((await admin.storage.from("exercise-media").list(`${org.id}/${exId}`)).data ?? []).map((f) => f.name);

const page = await login("owner.seed@example.com");
await page.goto(`${BASE}/treinos/exercicios`); await settle(page);

// Gera vídeos de teste no próprio navegador (sem ffmpeg): 1080p com áudio, 3 s.
const makeVideo = async (w, h, seconds, color) => page.evaluate(async ({ w, h, seconds, color }) => {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  const stream = c.captureStream(30);
  const ac = new AudioContext(); const osc = ac.createOscillator(); const dest = ac.createMediaStreamDestination(); osc.connect(dest); osc.start();
  stream.addTrack(dest.stream.getAudioTracks()[0]);
  const rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8,opus", videoBitsPerSecond: 8_000_000 });
  const chunks = []; rec.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise((r) => (rec.onstop = r));
  rec.start(100); const t0 = performance.now();
  await new Promise((resolve) => { const f = () => { const t = (performance.now() - t0) / 1000; ctx.fillStyle = color; ctx.fillRect(0, 0, w, h); for (let i = 0; i < 400; i++) { ctx.fillStyle = `hsl(${(i * 37 + t * 200) % 360},80%,50%)`; ctx.fillRect(Math.random() * w, Math.random() * h, 40, 40); } ctx.fillStyle = "#fff"; ctx.font = "120px sans-serif"; ctx.fillText(t.toFixed(1), 100, 200); if (t < seconds) requestAnimationFrame(f); else resolve(); }; f(); });
  rec.stop(); await done; osc.stop();
  const buf = await new Blob(chunks).arrayBuffer();
  let s = ""; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}, { w, h, seconds, color });
const TMP = fs.mkdtempSync(`${require("node:os").tmpdir()}/lfit-e2e-`);
const v1 = `${TMP}/teste-1080p.webm`, v2 = `${TMP}/teste-2.webm`, bad = `${TMP}/teste.mov`;
fs.writeFileSync(v1, Buffer.from(await makeVideo(1920, 1080, 3, "#224"), "base64"));
fs.writeFileSync(v2, Buffer.from(await makeVideo(1280, 720, 2, "#422"), "base64"));
fs.writeFileSync(bad, "não é vídeo");
console.log("  original:", (fs.statSync(v1).size / 1024).toFixed(0), "KB");

await page.reload(); await settle(page);
ok("barra de uso de vídeo", (await page.getByText(/de 500 MB usados/).count()) === 1);
const NAME = `Vídeo teste ${String(Date.now()).slice(-4)}`;
await page.getByRole("link", { name: "Novo exercício" }).click();
const d = page.getByRole("dialog");
await d.getByLabel("Nome").fill(NAME);
await d.getByRole("button", { name: "Abdômen" }).click();
await d.getByRole("tab", { name: "Enviar vídeo" }).click();
await d.locator("input[type=file]").setInputFiles(bad);
ok("tipo inválido recusado com dica", await d.getByText("Envie um arquivo MP4 ou WebM").waitFor({ timeout: 5000 }).then(() => true, () => false));
await d.locator("input[type=file]").setInputFiles(v1);
ok("progresso da otimização", await d.getByText(/Otimizando o vídeo/).waitFor({ timeout: 5000 }).then(() => true, () => false));
ok("vídeo preparado", await d.getByText(/Será enviado ao salvar/).waitFor({ timeout: 30000 }).then(() => true, () => false));
const note = await d.getByText(/Otimizado:|não conseguiu otimizar/).innerText();
console.log("  nota:", note);
await page.screenshot({ path: `${OUT}/01-form-video.png` });
await d.getByRole("tab", { name: "Link (YouTube/Vimeo)" }).click();
await d.getByLabel("Link do vídeo (opcional)").fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
await d.getByRole("button", { name: "Novo exercício" }).click();
ok("criado", await toastWith(page, "Exercício criado"));
await page.waitForURL(/ver=/); await settle(page);
ok("sem aviso de falha", (await page.locator("[data-sonner-toast][data-type=warning]").count()) === 0);
const exId = new URL(page.url()).searchParams.get("ver");
const { data: row } = await admin.from("exercises").select("video_path, poster_path, media_bytes").eq("id", exId).single();
ok("arquivos gravados (vídeo + poster)", Boolean(row.video_path && row.poster_path) && row.media_bytes > 0, JSON.stringify(row));
const dl = await admin.storage.from("exercise-media").download(row.video_path);
fs.writeFileSync(`${TMP}/enviado`, Buffer.from(await dl.data.arrayBuffer()));
console.log("  enviado:", (row.media_bytes / 1024).toFixed(0), "KB", row.video_path.split(".").pop());

const dd = page.getByRole("dialog");
ok("vídeo enviado tem prioridade sobre o link", (await dd.locator("iframe").count()) === 0 && (await dd.getByRole("button", { name: /Reproduzir vídeo/ }).count()) === 1);
ok("nada baixado antes do clique", (await dd.locator("video").count()) === 0);
await page.screenshot({ path: `${OUT}/02-detalhe-poster.png` });
await dd.getByRole("button", { name: /Reproduzir vídeo/ }).click();
const video = dd.locator("video");
const attrs = await video.evaluate((v) => ({ muted: v.muted, loop: v.loop, inline: v.playsInline, preload: v.getAttribute("preload"), src: v.currentSrc || v.src }));
ok("video muted/loop/playsInline/preload=none", attrs.muted && attrs.loop && attrs.inline && attrs.preload === "none", JSON.stringify({ ...attrs, src: "…" }));
await page.waitForFunction(() => { const v = document.querySelector("[role=dialog] video"); return v && v.readyState >= 2; }, null, { timeout: 15000 }).catch(() => {});
const info = await video.evaluate((v) => ({ w: v.videoWidth, h: v.videoHeight, t: v.currentTime }));
ok("reproduz em 720p", info.h === 720, JSON.stringify(info));
await page.screenshot({ path: `${OUT}/03-reproduzindo.png` });

// Mesma URL assinada em acessos seguidos (cache do navegador)
await page.reload(); await settle(page);
await page.getByRole("dialog").getByRole("button", { name: /Reproduzir vídeo/ }).click();
const src2 = await page.getByRole("dialog").locator("video").evaluate((v) => v.getAttribute("src"));
ok("URL assinada reaproveitada entre acessos", src2 === attrs.src, "");
ok("validade ~7 dias", (() => { const tok = new URL(src2).searchParams.get("token"); const p = JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString()); return p.exp - p.iat === 604800; })());

// Trocar vídeo: o antigo sai do Storage
await page.getByRole("dialog").getByRole("link", { name: "Editar exercício" }).click();
await page.waitForURL(/editar=/); await settle(page);
const e = page.getByRole("dialog");
await e.getByRole("tab", { name: "Enviar vídeo" }).click();
ok("mostra vídeo atual", (await e.getByText("Vídeo enviado", { exact: true }).count()) === 1);
await e.locator("input[type=file]").setInputFiles(v2);
await e.getByText(/Será enviado ao salvar/).waitFor({ timeout: 30000 });
await e.getByRole("button", { name: "Salvar" }).click();
ok("vídeo trocado", await toastWith(page, "Exercício atualizado"));
await page.waitForURL(/ver=/); await settle(page);
const after = await listFolder(exId);
const { data: row2 } = await admin.from("exercises").select("video_path, poster_path").eq("id", exId).single();
ok("sem órfãos após trocar (2 arquivos atuais)", after.length === 2 && after.every((n) => row2.video_path.endsWith(n) || row2.poster_path.endsWith(n)), after.join(","));

// Remover
await page.getByRole("dialog").getByRole("link", { name: "Editar exercício" }).click();
await page.waitForURL(/editar=/); await settle(page);
await page.getByRole("dialog").getByRole("tab", { name: "Enviar vídeo" }).click();
await page.getByRole("dialog").getByRole("button", { name: "Remover vídeo" }).click();
await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
await toastWith(page, "Exercício atualizado");
await page.waitForURL(/ver=/); await settle(page);
ok("remover apaga os arquivos", (await listFolder(exId)).length === 0);
ok("volta a exibir o link", (await page.getByRole("dialog").getByRole("button", { name: "Carregar vídeo" }).count()) === 1);

// Plano sem cota (free): só link, com CTA
await admin.from("organizations").update({ video_quota_bytes: 0 }).eq("id", org.id);
await page.goto(`${BASE}/treinos/exercicios?editar=${exId}`); await settle(page);
await page.getByRole("dialog").getByRole("tab", { name: "Enviar vídeo" }).click();
const c1 = await page.getByRole("dialog").getByText("Seu plano permite apenas links").count(), c2 = await page.getByRole("dialog").getByRole("button", { name: /Fazer upgrade/ }).count();
ok("cota zero: sem envio, explica o plano + CTA", c1 === 1 && c2 === 1, `${c1} ${c2}`);
await page.screenshot({ path: `${OUT}/04-plano-sem-video.png` });
await admin.from("organizations").update({ video_quota_bytes: 1000 }).eq("id", org.id);
await page.goto(`${BASE}/treinos/exercicios?editar=${exId}`); await settle(page);
await page.getByRole("dialog").getByRole("tab", { name: "Enviar vídeo" }).click();
await page.getByRole("dialog").locator("input[type=file]").setInputFiles(v2);
ok("cota excedida: recusado ao escolher, com CTA", await page.getByRole("dialog").getByText("O armazenamento de vídeos do seu plano acabou").waitFor({ timeout: 30000 }).then(() => true, () => false) && (await page.getByRole("dialog").getByRole("button", { name: /Fazer upgrade/ }).count()) === 1);
await page.screenshot({ path: `${OUT}/05-cota-excedida.png` });
await page.screenshot({ path: `${OUT}/04-plano-sem-video.png` });
await admin.from("organizations").update({ video_quota_bytes: null }).eq("id", org.id);

// Exclusão definitiva (owner): some a linha
await page.goto(`${BASE}/treinos/exercicios?ver=${exId}`); await settle(page);
await page.getByRole("dialog").getByRole("button", { name: "Excluir definitivamente" }).click();
await page.getByRole("alertdialog").getByRole("button", { name: "Excluir definitivamente" }).click();
ok("excluído", await toastWith(page, "Exercício excluído"));
const { count } = await admin.from("exercises").select("id", { count: "exact", head: true }).eq("id", exId);
ok("linha apagada", count === 0);

// Trainer não vê o botão de excluir
const t1 = await login("trainer1.seed@example.com");
await t1.goto(`${BASE}/treinos/exercicios`); await settle(t1);
await t1.getByRole("link", { name: "Abdominal supra" }).first().click();
await t1.getByRole("dialog").waitFor();
ok("trainer sem exclusão definitiva", (await t1.getByRole("button", { name: "Excluir definitivamente" }).count()) === 0);
for (const p of [page, t1]) ok("sem erros de JS", p.errors.length === 0, p.errors.join(" | "));
console.log(fails ? `${fails} falha(s)` : "Tudo ok");
await browser.close();
