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
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const as = async (email) => { const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } }); await c.auth.signInWithPassword({ email, password: PW }); return c; };
const ownerC = await as("owner.seed@example.com");
const t1 = (await db.from("profiles").select("id").eq("full_name", "Bianca Exemplo").single()).data.id;
const t1email = (await db.auth.admin.getUserById(t1)).data.user.email;
const ANA = (await db.from("students").select("id, trainer_id").eq("first_name", "Ana").eq("last_name", "Duarte").single()).data;
const NOTE = "Nota secreta da triagem 293";
const { error: e1 } = await ownerC.rpc("record_red_flag_check", { p_student_id: ANA.id, p_items: ["calf_swelling", "chest_pain_exertion"], p_referred: true, p_note: NOTE });
const { data: planId, error: e2 } = await ownerC.rpc("save_training_plan", { p_plan: { student_id: ANA.id, name: "Plano t293", trainer_id: t1, workouts: [{ label: "A", items: [] }] } });
ok("preparo", !e1 && !e2, (e1?.message ?? "") + (e2?.message ?? ""));
// professor do plano
const tp = await login(t1email);
await tp.goto(`${BASE}/treinos/${planId}/editar`); await settle(tp);
ok("aviso restrito", (await tp.getByText("Aluno com pendência de liberação — alinhe com o professor responsável antes de prescrever").count()) === 1);
const html = await tp.content();
const leaks = ["Panturrilha", "Dor no peito", NOTE, "encaminhado", "Abrir o cadastro", "Sinais de alerta relatados", "Condições do aluno"].filter((w) => html.includes(w));
ok("nenhum dado da triagem no HTML", leaks.length === 0, leaks.join(", "));
await tp.screenshot({ path: `${OUT}/rf-restricted.png` });
// owner (responsável) vê o aviso completo, não o restrito
const ow = await login("owner.seed@example.com");
await ow.goto(`${BASE}/treinos/${planId}/editar`); await settle(ow);
ok("responsável: aviso completo", (await ow.getByText("Sinais de alerta relatados/observados sem liberação").count()) === 1 && (await ow.getByText(/Aluno com pendência de liberação/).count()) === 0);
// limpeza: remove o plano de teste e libera
await db.from("training_plans").delete().eq("id", planId);
await db.from("student_red_flag_checks").delete().eq("student_id", ANA.id).eq("note", NOTE);
ok("sem erros de página", [tp, ow].every((p) => p.errors.length === 0), [tp, ow].flatMap((p) => p.errors).join(" | "));
await browser.close();
console.log(fails ? `${fails} falha(s)` : "tudo ok");
process.exit(fails ? 1 : 0);
