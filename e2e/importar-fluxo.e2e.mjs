import "./_guard.mjs";
import { waitLoggedIn } from "./_login.mjs";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const { createClient } = require("@supabase/supabase-js");
const BASE = process.env.BASE ?? "http://localhost:3000", OUT = process.env.OUT, PW = process.env.SEED_USER_PASSWORD;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const browser = await chromium.launch({ channel: "chrome" });
let fails = 0;
const ok = (n, c, e = "") => { console.log(`${c ? "✓" : "✗"} ${n}${e ? " — " + e : ""}`); if (!c) fails++; };

// Importador no desktop, fluxo completo (precisa da migration 20261119130000 aplicada): declaração obrigatória,
// importação real, CSV de recusadas com fórmula neutralizada, histórico e "Desfazer". Idempotente: apaga no fim os
// alunos e o lote criados (pela marca única desta execução). Dados fictícios (example.com).
const RUN = Date.now().toString(36);
const csv = [
  "Nome;E-mail;Celular;Observações médicas;Status",
  `Lia Import ${RUN};lia.${RUN}@example.com;(41) 99901-0287;;ativo`,
  `Rui Import ${RUN};rui.${RUN}@example.com;;;inativo`,
  `=HYPERLINK("http://x");sem-email;;;`,
].join("\r\n");

const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
page.errors = []; page.on("pageerror", (e) => page.errors.push(e.message));
try {
  await page.goto(`${BASE}/entrar`);
  await page.getByLabel("E-mail").fill("trainer1.seed@example.com");
  await page.getByLabel("Senha", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Entrar" }).click();
  await waitLoggedIn(page, `${BASE}/`);

  await page.goto(`${BASE}/importar`);
  await page.locator("#import-file").setInputFiles({ name: "alunos.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
  await page.getByRole("heading", { name: "Confira as colunas" }).waitFor();
  const notesSel = await page.getByLabel("Observações", { exact: true }).evaluate((s) => s.options[s.selectedIndex].text);
  ok("coluna 'Observações médicas' não foi sugerida", notesSel === "— não importar —");
  ok("aviso fixo de saúde visível", (await page.getByText("Não importe dados de saúde nas observações").count()) > 0);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("heading", { name: "Revisão" }).waitFor();

  const importBtn = page.getByRole("button", { name: "Importar 2 alunos" });
  ok("Importar desabilitado sem a declaração", await importBtn.isDisabled());
  await page.getByLabel("De onde vêm estes alunos?").fill(`e2e ${RUN}`);
  await page.getByRole("checkbox").check();
  ok("Importar habilitado com a declaração", await importBtn.isEnabled());
  await importBtn.click();
  await page.getByRole("heading", { name: "Resultado" }).waitFor({ timeout: 30000 });
  ok("2 importados, 1 recusada", (await page.getByText("2 alunos importados · 1 linha recusada").count()) === 1);

  const { data: batch } = await admin.from("import_batches").select("id, declaration_version, created_count").eq("source_label", `e2e ${RUN}`).single();
  ok("lote gravado com a versão da declaração", batch?.declaration_version === "2026-11-19.1" && batch?.created_count === 2);
  const { data: studs } = await admin.from("students").select("id, user_id, source").eq("import_batch_id", batch.id);
  ok("pré-cadastro: sem login, origem import", studs.length === 2 && studs.every((s) => s.user_id === null && s.source === "import"));

  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar linhas recusadas" }).click()]);
  const rejected = readFileSync(await dl.path(), "utf8");
  ok("CSV de recusadas neutraliza fórmula", rejected.includes(`"'=HYPERLINK(""http://x"")"`) && !/;=HYPERLINK/.test(rejected));
  await page.screenshot({ path: `${OUT}/importar-03-resultado.png`, fullPage: true });

  await page.waitForTimeout(1000); // router.refresh do histórico
  const row = page.locator("li", { hasText: `e2e ${RUN}` });
  await row.getByRole("button", { name: "Desfazer" }).click();
  await page.getByRole("button", { name: "Desfazer importação" }).click();
  await page.locator("[data-sonner-toast]", { hasText: "arquivados" }).waitFor({ timeout: 15000 });
  const { data: after } = await admin.from("students").select("deleted_at").eq("import_batch_id", batch.id);
  ok("desfazer arquivou os 2 (sem atividade)", after.length === 2 && after.every((s) => s.deleted_at !== null));
  ok("sem erro de página", page.errors.length === 0, page.errors.join(" | "));
} catch (e) {
  ok("roteiro terminou", false, e.message);
} finally {
  const { data: b } = await admin.from("import_batches").select("id").eq("source_label", `e2e ${RUN}`);
  for (const x of b ?? []) {
    await admin.from("students").delete().eq("import_batch_id", x.id);
    await admin.from("import_batches").delete().eq("id", x.id);
  }
  await browser.close();
}
process.exit(fails ? 1 : 0);
