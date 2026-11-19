import "./_guard.mjs";
import { waitLoggedIn } from "./_login.mjs";
import { makePng, seedIds } from "./_fixtures.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const { createClient } = require("@supabase/supabase-js");
const BASE = process.env.BASE ?? "http://localhost:3000", OUT = process.env.OUT, PW = process.env.SEED_USER_PASSWORD;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const browser = await chromium.launch({ channel: "chrome" });
let fails = 0;
const ok = (n, c, e = "") => { console.log(`${c ? "✓" : "✗"} ${n}${e ? " — " + e : ""}`); if (!c) fails++; };
const toast = (p, text) => p.locator("[data-sonner-toast]", { hasText: text }).first().waitFor({ timeout: 15000 }).then(() => true, () => false);
// O toast do post anterior ainda pode estar na tela: "salvou" = o diálogo do editor fechou (só fecha com sucesso).
const saved = async (p, text) => (await p.getByRole("dialog").waitFor({ state: "detached", timeout: 20000 }).then(() => true, () => false)) && (await toast(p, text));
const until = async (fn, timeout = 15000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 300)); } return fn(); };
const visible = (loc, timeout = 15000) => loc.first().waitFor({ timeout }).then(() => true, () => false);

// Feed do personal no desktop (precisa da migration 20261119160000): criar texto (HTML retirado, prévia, aviso fixo),
// agendar, vídeo por link, imagem (reduzida no navegador e enviada ao bucket privado), fixar, editar, apagar e ver a
// contagem de curtidas. Dados próprios: tudo leva a marca desta execução e é apagado no fim (posts e imagens).
const MARK = `feed-p-${Date.now().toString(36)}`;
// PNG válido gerado na hora (64×48) — o navegador decodifica, redimensiona e gera WebP/JPEG.
const PNG = makePng(64, 48);
const { org, camila } = await seedIds(admin);
const spLocal = (ms) => new Date(Date.now() + ms - 3 * 3_600_000).toISOString().slice(0, 16);

let page = null;
try {
  page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.errors = []; page.on("pageerror", (e) => page.errors.push(e.message));
  await page.goto(`${BASE}/entrar`);
  await page.getByLabel("E-mail").fill("owner.seed@example.com");
  await page.getByLabel("Senha", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Entrar" }).click();
  await waitLoggedIn(page, `${BASE}/`);

  ok("papel do dono aparece como 'Personal'", (await page.getByText("Personal", { exact: true }).count()) >= 1);
  await page.locator('nav[aria-label="Menu principal"] a[href="/feed"]').click();
  await page.waitForURL(`${BASE}/feed`);
  await page.getByRole("heading", { level: 1, name: "Feed" }).waitFor();

  // --- Texto: aviso fixo, HTML retirado, prévia ------------------------------------------------------------------
  await page.getByRole("button", { name: "Novo post" }).click();
  const dialog = page.getByRole("dialog");
  ok("aviso fixo no editor", (await dialog.getByText("Não publique dados de saúde nem fotos de alunos sem autorização deles.").count()) === 1);
  await dialog.getByLabel("Texto", { exact: true }).fill(`<b>Dica</b> da semana: hidrate-se. https://exemplo.com/agua ${MARK}`);
  const preview = dialog.locator("section", { hasText: "Prévia (como o aluno vê)" });
  ok("prévia mostra o texto sem HTML", (await preview.innerText()).includes(`Dica da semana: hidrate-se.`) && !(await preview.innerText()).includes("<b>"));
  ok("link da prévia abre fora sem repassar a origem", (await preview.getByRole("link", { name: "https://exemplo.com/agua" }).getAttribute("rel")) === "noopener noreferrer");
  await dialog.getByRole("button", { name: "Publicar" }).click();
  ok("publicado", await saved(page, "Post publicado."));
  const { data: textRow } = await admin.from("feed_posts").select("id, body").eq("organization_id", org).like("body", `%${MARK}%`).eq("kind", "text").single();
  ok("banco: texto puro", textRow?.body.startsWith("Dica da semana") && !textRow.body.includes("<"));

  // --- Agendado ----------------------------------------------------------------------------------------------------
  await page.getByRole("button", { name: "Novo post" }).click();
  await dialog.getByLabel("Texto", { exact: true }).fill(`Aviso agendado ${MARK}`);
  await dialog.getByLabel("Agendar publicação").fill(spLocal(2 * 86_400_000));
  await dialog.getByRole("button", { name: "Agendar" }).click();
  ok("agendado", await saved(page, "Post agendado."));
  const scheduledItem = page.getByRole("listitem").filter({ hasText: `Aviso agendado ${MARK}` });
  ok("lista mostra 'Agendado para…'", await visible(scheduledItem.getByText(/Agendado para \d{2}\/\d{2}\/\d{4}/)));

  // --- Vídeo por link: recusa link inválido -------------------------------------------------------------------------
  await page.getByRole("button", { name: "Novo post" }).click();
  await dialog.getByLabel("Tipo").selectOption("video");
  await dialog.getByLabel("Link do vídeo").fill("javascript:alert(1)");
  ok("link inválido avisado", (await dialog.getByText("Use um link https do YouTube, Vimeo ou Instagram.").count()) >= 1);
  await dialog.getByLabel("Link do vídeo").fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await dialog.getByLabel("Texto (opcional)").fill(`Vídeo da técnica ${MARK}`);
  ok("prévia do vídeo sem carregar o player", (await dialog.locator("iframe").count()) === 0 && (await dialog.getByRole("button", { name: /Assistir ao vídeo/ }).count()) === 1);
  await dialog.getByRole("button", { name: "Publicar" }).click();
  ok("vídeo publicado", await saved(page, "Post publicado."));

  // --- Imagem: reduzida no navegador e enviada ao bucket privado ----------------------------------------------------
  await page.getByRole("button", { name: "Novo post" }).click();
  await dialog.getByLabel("Tipo").selectOption("image");
  await dialog.locator('input[type="file"]').setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: PNG });
  await dialog.getByRole("button", { name: "Trocar imagem" }).waitFor({ timeout: 20000 });
  ok("prévia da imagem", (await dialog.getByRole("img", { name: "Imagem do post" }).count()) === 1);
  await dialog.getByLabel("Texto (opcional)").fill(`Foto do espaço ${MARK}`);
  await dialog.getByRole("button", { name: "Publicar" }).click();
  ok("imagem publicada", await saved(page, "Post publicado."));
  const { data: imageRow } = await admin.from("feed_posts").select("id, image_path").eq("organization_id", org).like("body", `%${MARK}%`).eq("kind", "image").maybeSingle();
  ok("imagem na pasta da organização, em WebP/JPEG", new RegExp(`^${org}/[0-9a-f-]{36}\\.(webp|jpg)$`).test(imageRow?.image_path ?? ""), imageRow?.image_path);
  const imageItem = page.getByRole("listitem").filter({ hasText: `Foto do espaço ${MARK}` });
  await visible(imageItem.getByRole("img", { name: "Imagem do post" }));
  const src = await imageItem.getByRole("img", { name: "Imagem do post" }).getAttribute("src");
  ok("imagem servida por URL assinada (bucket privado)", /\/storage\/v1\/object\/sign\/feed-media\//.test(src ?? ""), src);

  // --- Fixar, editar, curtidas, apagar ---------------------------------------------------------------------------------
  const textItem = page.getByRole("listitem").filter({ hasText: `hidrate-se` }).filter({ hasText: MARK });
  await textItem.getByRole("button", { name: "Fixar no topo" }).click();
  ok("fixado", await toast(page, "Post fixado no topo."));
  ok("fixado vai para o topo", await until(async () => (await page.getByRole("list", { name: "Feed" }).getByRole("listitem").first().innerText()).includes("hidrate-se")));
  await admin.from("feed_likes").insert({ post_id: textRow.id, student_id: camila, organization_id: org });
  await textItem.getByRole("button", { name: "Editar" }).click();
  await dialog.getByLabel("Texto", { exact: true }).fill(`Dica editada ${MARK}`);
  await dialog.getByRole("button", { name: "Salvar alterações" }).click();
  ok("editado", await saved(page, "Post atualizado."));
  const edited = page.getByRole("listitem").filter({ hasText: `Dica editada ${MARK}` });
  ok("contagem de curtidas (sem nomes)", (await visible(edited.getByText("1 curtida"))) && !(await edited.innerText()).includes("Camila"));
  await page.screenshot({ path: `${OUT}/feed-personal-01-lista.png`, fullPage: true });

  await scheduledItem.getByRole("button", { name: "Apagar" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Apagar" }).click();
  ok("apagado", await toast(page, "Post apagado."));
  ok("some da lista", await scheduledItem.waitFor({ state: "detached", timeout: 10000 }).then(() => true, () => false));
  // Apagar post com imagem: o servidor remove o arquivo do Storage na hora.
  await imageItem.getByRole("button", { name: "Apagar" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Apagar" }).click();
  ok("post com imagem apagado", await imageItem.waitFor({ state: "detached", timeout: 10000 }).then(() => true, () => false));
  const { data: deletedRow } = await admin.from("feed_posts").select("deleted_at").eq("id", imageRow.id).single();
  ok("banco: post com imagem apagado (soft delete)", Boolean(deletedRow?.deleted_at));
  const fileName = imageRow.image_path.split("/")[1];
  const fileLeft = async () => ((await admin.storage.from("feed-media").list(org, { search: fileName })).data ?? []).some((f) => f.name === fileName);
  ok("arquivo da imagem removido do Storage", await until(async () => !(await fileLeft()), 10000));
  ok("sem rolagem horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  ok("sem erro de página", page.errors.length === 0, page.errors.join(" | "));
} catch (e) {
  if (page) await page.screenshot({ path: `${OUT}/feed-personal-erro.png`, fullPage: true }).catch(() => {});
  ok("roteiro terminou", false, e.message);
} finally {
  const { data: rows } = await admin.from("feed_posts").select("image_path").eq("organization_id", org).like("body", `%${MARK}%`);
  const images = (rows ?? []).map((r) => r.image_path).filter(Boolean);
  if (images.length) await admin.storage.from("feed-media").remove(images);
  await admin.from("feed_posts").delete().eq("organization_id", org).like("body", `%${MARK}%`);
  await browser.close();
}
process.exit(fails ? 1 : 0);
