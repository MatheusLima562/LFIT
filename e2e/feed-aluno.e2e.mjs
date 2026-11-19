import "./_guard.mjs";
import { waitLoggedIn } from "./_login.mjs";
import { seedIds } from "./_fixtures.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const { createClient } = require("@supabase/supabase-js");
const BASE = process.env.BASE ?? "http://localhost:3000", OUT = process.env.OUT, PW = process.env.SEED_USER_PASSWORD;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const browser = await chromium.launch({ channel: "chrome" });
let fails = 0;
const ok = (n, c, e = "") => { console.log(`${c ? "✓" : "✗"} ${n}${e ? " — " + e : ""}`); if (!c) fails++; };
const overlap = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// Comunidade (feed) no celular de 375 px (precisa da migration 20261119160000). Dados próprios: posts criados aqui com
// a secret key (marca única), apagados no fim; o cursor de "novidades" da Camila é refeito no começo.
const MARK = `feed-e2e-${Date.now().toString(36)}`;
const { camila, org, owner } = await seedIds(admin);
const now = Date.now();
const iso = (ms) => new Date(now + ms).toISOString();
// Todas as linhas com as MESMAS chaves: num insert em lote o PostgREST manda null onde a chave falta (sem o default).
const post = (body, extra = {}) => ({
  organization_id: org, author_id: owner, kind: "text", body: `${body} ${MARK}`, audience: "all", audience_modality: null,
  video_url: null, pinned: false, published_at: iso(0), deleted_at: null, ...extra,
});

let page = null;
try {
  await admin.from("feed_reads").delete().eq("student_id", camila);
  const { data: camilaRow } = await admin.from("students").select("modality").eq("id", camila).single();
  const otherModality = camilaRow.modality === "presencial" ? "consultoria" : "presencial";
  const { error: insError } = await admin.from("feed_posts").insert([
    post("Antigo", { published_at: iso(-3 * 3_600_000) }),
    post("Fixado no topo", { pinned: true, published_at: iso(-2 * 3_600_000) }),
    post("Mais novo", { published_at: iso(-60_000) }),
    post("Agendado (não pode aparecer)", { published_at: iso(86_400_000) }),
    post("Apagado (não pode aparecer)", { deleted_at: iso(0) }),
    post("Outra modalidade (não pode aparecer)", { audience: "modality", audience_modality: otherModality }),
    post("Vídeo", { kind: "video", body: `Veja ${MARK}`, video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", published_at: iso(-90_000) }),
  ]);
  if (insError) throw new Error(insError.message);

  page = await (await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  page.errors = []; page.on("pageerror", (e) => page.errors.push(e.message));
  await page.goto(`${BASE}/aluno/entrar`);
  await page.getByLabel("E-mail").fill("aluno.seed@example.com");
  await page.getByLabel("Senha", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Entrar" }).click();
  await waitLoggedIn(page, `${BASE}/aluno`);

  // 5 abas a 375 px: cabem, sem cortar o rótulo, sem se sobrepor, dentro da tela.
  const nav = page.getByRole("navigation", { name: "Navegação do app" });
  const links = nav.getByRole("link");
  ok("barra com 5 abas", (await links.allInnerTexts()).map((x) => x.trim()).join("|") === "Hoje|Histórico|Comunidade|Chat|Perfil");
  const boxes = await links.evaluateAll((as) => as.map((a) => { const r = a.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, clipped: a.scrollWidth > a.clientWidth + 1 }; }));
  ok("5 abas dentro de 375 px", boxes.every((b) => b.x >= 0 && b.x + b.width <= 375.5), JSON.stringify(boxes.map((b) => Math.round(b.width))));
  ok("rótulos inteiros (nada cortado)", boxes.every((b) => !b.clipped));
  ok("abas sem sobreposição", boxes.every((b, i) => i === 0 || b.x >= boxes[i - 1].x + boxes[i - 1].width - 0.5));
  ok("toque de pelo menos 44 px de altura", boxes.every((b) => b.height >= 44));
  const community = nav.locator('a[href="/aluno/comunidade"]');
  ok("marcador de novidades na aba Comunidade", (await community.getAttribute("aria-label")) === "Comunidade, há novidades", await community.getAttribute("aria-label"));
  await page.screenshot({ path: `${OUT}/feed-aluno-01-abas.png` });

  await community.click();
  await page.waitForURL(`${BASE}/aluno/comunidade`);
  await page.getByRole("heading", { level: 1, name: "Comunidade" }).waitFor();
  const list = page.getByRole("list", { name: "Comunidade" });
  const items = (await list.getByRole("listitem").allInnerTexts()).filter((x) => x.includes(MARK));
  ok("fixado no topo, depois do mais novo para o mais antigo", items.length === 4 && items[0].includes("Fixado no topo") && items[1].includes("Mais novo") && items[2].includes("Veja") && items[3].includes("Antigo"), JSON.stringify(items.map((x) => x.split("\n").find((l) => l.includes(MARK)))));
  const all = await list.innerText();
  ok("agendado, apagado e de outra modalidade não aparecem", !/não pode aparecer/.test(all));
  ok("primeira visita: nenhum 'Novo'", (await list.getByText("Novo", { exact: true }).count()) === 0);
  ok("vídeo do YouTube não carrega nada antes do toque", (await page.locator("iframe").count()) === 0 && (await list.getByRole("button", { name: /Assistir ao vídeo/ }).count()) >= 1);
  ok("aba atual marcada; marcador some", (await community.getAttribute("aria-current")) === "page" && (await community.getAttribute("aria-label")) === null);

  // Curtir: só a contagem, nunca quem curtiu.
  const fixed = list.getByRole("listitem").filter({ hasText: `Fixado no topo ${MARK}` });
  const like = fixed.getByRole("button", { name: /Curtir/ });
  ok("curtir começa em 0", (await like.getAttribute("aria-label")) === "Curtir (0 curtidas)", await like.getAttribute("aria-label"));
  await like.click();
  const liked = fixed.getByRole("button", { name: "Descurtir (1 curtida)" });
  ok("curtiu: contagem 1 e estado pressionado", await liked.waitFor({ timeout: 10000 }).then(async () => (await liked.getAttribute("aria-pressed")) === "true", () => false));
  const { data: postRow } = await admin.from("feed_posts").select("id").eq("body", `Fixado no topo ${MARK}`).single();
  const { count } = await admin.from("feed_likes").select("post_id", { count: "exact", head: true }).eq("post_id", postRow.id);
  ok("banco: 1 curtida", count === 1);
  ok("aviso de privacidade das curtidas", (await page.getByText("Ninguém vê quem curtiu: aparece só o número de curtidas.").count()) === 1);
  ok("sem rolagem horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  const lastPost = await list.getByRole("listitem").last().boundingBox();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const navBox = await nav.boundingBox();
  const privacy = await page.getByText("Ninguém vê quem curtiu").boundingBox();
  ok("barra não cobre o fim da lista", !overlap(navBox, privacy), JSON.stringify([navBox, privacy, lastPost && Math.round(lastPost.y)]));
  await page.screenshot({ path: `${OUT}/feed-aluno-02-comunidade.png`, fullPage: true });

  // Volta depois de um post novo: "Novo" só no que chegou depois da visita.
  await admin.from("feed_posts").insert(post("Chegou agora", { published_at: new Date().toISOString() }));
  await page.reload();
  await list.waitFor();
  const fresh = list.getByRole("listitem").filter({ hasText: `Chegou agora ${MARK}` });
  ok("post novo marcado como 'Novo'", (await fresh.getByText("Novo", { exact: true }).count()) === 1);
  ok("post já visto sem 'Novo'", (await list.getByRole("listitem").filter({ hasText: `Antigo ${MARK}` }).getByText("Novo", { exact: true }).count()) === 0);
  ok("sem erro de página", page.errors.length === 0, page.errors.join(" | "));
} catch (e) {
  if (page) await page.screenshot({ path: `${OUT}/feed-aluno-erro.png`, fullPage: true }).catch(() => {});
  ok("roteiro terminou", false, e.message);
} finally {
  await admin.from("feed_posts").delete().eq("organization_id", org).like("body", `%${MARK}%`);
  await admin.from("feed_reads").delete().eq("student_id", camila);
  await browser.close();
}
process.exit(fails ? 1 : 0);
