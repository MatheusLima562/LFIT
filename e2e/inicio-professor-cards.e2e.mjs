/**
 * Início do PROFESSOR (Caio, trainer2 do seed) com os cards do dashboard: cada número da tela confere com as RPCs do
 * banco (vale com qualquer volume de dados — rode depois do f3 ou do `npm run db:seed:demo` para ver números maiores).
 * Salva o print também em tutoriais-video/inicio-professor.png (pasta fora do git).
 *   BASE=http://localhost:3100 npm run test:e2e -- f3 inicio-professor --no-reseed
 */
import "./_guard.mjs";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const { createClient } = require("@supabase/supabase-js");
const BASE = process.env.BASE ?? "http://localhost:3000", OUT = process.env.OUT, PW = process.env.SEED_USER_PASSWORD;
const EMAIL = "trainer2.seed@example.com";
let fails = 0;
const ok = (n, c, e = "") => { console.log(`${c ? "✓" : "✗"} ${n}${e ? " — " + e : ""}`); if (!c) fails++; };

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
await db.auth.signInWithPassword({ email: EMAIL, password: PW });
const { data: training, error: e1 } = await db.rpc("get_dashboard_training_stats");
const { data: eng, error: e2 } = await db.rpc("get_dashboard_engagement_retention");
ok("RPCs do dashboard respondem para o professor", !e1 && !e2, e1?.message ?? e2?.message ?? "");

const browser = await chromium.launch({ channel: "chrome" });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${BASE}/entrar`);
await page.getByLabel("E-mail").fill(EMAIL);
await page.getByLabel("Senha", { exact: true }).fill(PW);
await page.getByRole("button", { name: "Entrar" }).click();
await page.waitForURL(`${BASE}/`, { timeout: 30000 });
await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

const overview = page.getByRole("region", { name: "Visão geral" });
const text = (await overview.innerText()).replace(/\s+/g, " ");
ok("tile Treinos registrados = banco", text.includes(`Treinos registrados ${training.registered_30d}`), text);
const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
ok("tile Engajamento = banco", text.includes(`Engajamento semanal ${pct(eng.engagement.trained_7d, eng.engagement.active_students)}`), text);
ok("tile Retenção = banco", text.includes(`Retenção ${pct(eng.retention.retained_0_30, eng.retention.base_31_60)}`), text);
const done = page.getByRole("region", { name: "Treinos concluídos" });
ok("card Treinos concluídos = banco", (await done.getByText(`${training.completed_today_count} hoje`).count()) === 1);
ok("card Treinos da semana", (await page.getByRole("region", { name: "Treinos da semana" }).count()) === 1);
const top = page.getByRole("region", { name: "Top 5 alunos" });
for (const t of training.top5) ok(`Top 5: ${t.student_name}`, (await top.getByText(t.student_name).count()) === 1);
const rated = eng.satisfaction.ratings;
ok("Satisfação só com notas", (await page.getByRole("region", { name: "Satisfação dos alunos" }).count()) === (rated > 0 ? 1 : 0));
if (rated > 0) {
  const avg = Number(eng.satisfaction.average).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  ok("Satisfação = banco (média · notas)", (await page.getByText(`${avg} · ${rated} ${rated === 1 ? "nota" : "notas"}`).count()) === 1);
}
ok("sem erros de página", errors.length === 0, errors.join(" | "));

mkdirSync("tutoriais-video", { recursive: true });
await page.screenshot({ path: `${OUT}/inicio-professor.png`, fullPage: true });
await page.screenshot({ path: "tutoriais-video/inicio-professor.png", fullPage: true });
await page.setViewportSize({ width: 375, height: 812 });
await page.reload();
await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
const sw = await page.evaluate(() => document.documentElement.scrollWidth);
ok("375 px sem rolagem horizontal", sw <= 375, String(sw));
await page.screenshot({ path: "tutoriais-video/inicio-professor-375.png", fullPage: true });
await browser.close();
console.log(fails ? `${fails} falha(s)` : "tudo ok");
process.exit(fails ? 1 : 0);
