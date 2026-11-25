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
const visible = (loc, timeout = 15000) => loc.first().waitFor({ timeout }).then(() => true, () => false);
const toast = (p, text) => p.locator("[data-sonner-toast]", { hasText: text }).first().waitFor({ timeout: 20000 }).then(() => true, () => false);
const until = async (fn, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 300)); } return false; };

// Comando com IA (sprint edição, PARTE B) a 375 px com PROVEDOR FALSO — o servidor precisa subir com AI_PROVIDER=fake
// (`AI_PROVIDER=fake npx next start -p 3100`). Liga a flag SÓ na org de exemplo durante o roteiro e DESLIGA no fim.
// Dados próprios: o treino ativo da Camila (valores devolvidos no fim) e o histórico dela (apagado no fim).
const { camila, org } = await seedIds(admin);
const { data: orgRow } = await admin.from("organizations").select("plan, ai_coach_enabled").eq("id", org).single();
const { data: plan } = await admin.from("training_plans").select("id").eq("student_id", camila).eq("status", "active").single();
const { data: workouts } = await admin.from("plan_workouts").select("id, label, plan_workout_items(id, sets, quantity_min, quantity_max, load_value, load_unit, load_text, plan_item_sets(id), exercises(name))").eq("plan_id", plan.id).order("position");
const all = workouts.flatMap((w) => w.plan_workout_items.map((i) => ({ ...i, label: w.label })));
const original = all.map((i) => ({ id: i.id, sets: i.sets, quantity_min: i.quantity_min, quantity_max: i.quantity_max, load_value: i.load_value }));
// Exercício com nome único (primeira palavra de 4+ letras que não aparece em outro exercício), editável e com carga.
const words = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/\s+/).filter((x) => x.length >= 4);
const target = all.find((i) => !i.plan_item_sets.length && i.load_text === null && i.load_value !== null
  && words(i.exercises.name).some((w) => all.filter((o) => o.id !== i.id && words(o.exercises.name).includes(w)).length === 0));
const key = words(target.exercises.name).find((w) => all.filter((o) => o.id !== target.id && words(o.exercises.name).includes(w)).length === 0);
const loadNow = async () => Number((await admin.from("plan_workout_items").select("load_value").eq("id", target.id).single()).data.load_value);

try {
  await admin.from("prescription_changes").delete().eq("student_id", camila);
  // Desligado: o campo nem aparece.
  await admin.from("organizations").update({ ai_coach_enabled: false }).eq("id", org);
  const page = await (await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })).newPage();
  page.errors = []; page.on("pageerror", (e) => page.errors.push(e.message));
  await page.goto(`${BASE}/entrar`);
  await page.getByLabel("E-mail").fill("owner.seed@example.com");
  await page.getByLabel("Senha", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Entrar" }).click();
  await waitLoggedIn(page, `${BASE}/`);
  await page.goto(`${BASE}/alunos/${camila}/treinos/ficha`);
  await page.getByTestId("quick-item").first().waitFor();
  ok("desligado por padrão: sem campo de comando", (await page.getByRole("region", { name: "Comando (IA)" }).count()) === 0);
  ok("desligado por padrão: sem barra do microfone", (await page.getByTestId("coach-mic-bar").count()) === 0);

  // Liga SÓ na org de exemplo, no plano Pro.
  await admin.from("organizations").update({ ai_coach_enabled: true, plan: "pro" }).eq("id", org);
  await page.reload();
  const box = page.getByRole("region", { name: "Comando (IA)" });
  ok("ligado: campo de comando com aviso de privacidade", await visible(box.getByText("Não escreva dados de saúde")));

  // Ambiguidade → pergunta, nada muda.
  const before = await loadNow();
  await box.getByLabel("Comando").fill("aumenta tudo");
  await box.getByRole("button", { name: "Enviar" }).click();
  ok("ambíguo: a IA pergunta", await visible(box.getByText("A IA precisa de um detalhe:"), 25000));
  ok("nada mudou", (await loadNow()) === before);

  // Comando claro → proposta antes → depois → confirmar.
  await box.getByLabel("Comando").fill(`${key} +2,5 kg`);
  await box.getByRole("button", { name: "Enviar" }).click();
  const proposal = page.getByTestId("coach-proposal");
  ok("proposta com antes → depois", await visible(proposal.getByText(`${String(before).replace(".", ",")} → ${String(before + 2.5).replace(".", ",")}`), 25000), await proposal.innerText().catch(() => ""));
  ok("proposta não grava sozinha", (await loadNow()) === before);
  await page.screenshot({ path: `${OUT}/comando-ia-01-proposta-375.png`, fullPage: true });
  await proposal.getByRole("button", { name: "Aplicar alterações" }).click();
  ok("aplicado após confirmar", await toast(page, "Alterações aplicadas."));
  ok("banco: carga +2,5", await until(async () => (await loadNow()) === before + 2.5));
  await page.reload();
  ok("histórico com origem 'Comando (IA)' e desfazer", await visible(page.getByRole("region", { name: "Histórico de alterações" }).getByTestId("history-batch").filter({ hasText: "Comando (IA)" })));
  const { count } = await admin.from("prescription_changes").select("id", { count: "exact", head: true }).eq("student_id", camila).eq("source", "ai");
  ok("banco: histórico com origem ai", count === 1);
  ok("sem rolagem horizontal a 375 px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  ok("sem erro de página", page.errors.length === 0, page.errors.join(" | "));
  const cookies = await page.context().cookies();
  await page.context().close();

  // --- Microfone central (complemento) ------------------------------------------------------------------------------
  // Voz simulada: reconhecimento do navegador trocado por um falso que "ouve" o texto (sem microfone no teste).
  const newMobile = async (transcript) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    await ctx.addCookies(cookies);
    await ctx.addInitScript((said) => {
      if (said === null) {
        delete window.SpeechRecognition;
        delete window.webkitSpeechRecognition;
        return;
      }
      class FakeRecognition {
        start() { setTimeout(() => { this.onresult?.({ results: [[{ transcript: said }]] }); this.onend?.(); }, 200); }
        stop() { this.onend?.(); }
        abort() {}
      }
      window.SpeechRecognition = FakeRecognition;
      window.webkitSpeechRecognition = FakeRecognition;
    }, transcript);
    const p = await ctx.newPage();
    p.errors = []; p.on("pageerror", (e) => p.errors.push(e.message));
    return p;
  };
  const camilas = (await admin.from("students").select("id", { count: "exact", head: true }).eq("organization_id", org).ilike("first_name", "camila").is("deleted_at", null)).count;
  const mob = await newMobile(`${key} da Camila mais 2,5 kg`);
  await mob.goto(`${BASE}/alunos`);
  const bar = mob.getByTestId("coach-mic-bar");
  ok("barra inferior com o microfone no centro (375 px)", await visible(bar));
  const mic = bar.getByRole("button", { name: "Comando por voz" });
  const micBox = await mic.boundingBox();
  const barBox = await bar.boundingBox();
  ok("microfone grande (≥ 56 px) e centralizado", micBox && micBox.width >= 56 && Math.abs(micBox.x + micBox.width / 2 - 187.5) <= 2, JSON.stringify(micBox));
  await mob.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const lastBottom = await mob.evaluate(() => { const m = document.getElementById("conteudo"); const kids = m ? [...m.querySelectorAll("*")] : []; return Math.max(...kids.filter((k) => k.getBoundingClientRect().height > 0).map((k) => k.getBoundingClientRect().bottom)); });
  ok("barra não cobre o fim da página", barBox && lastBottom <= barBox.y + 1, `${lastBottom} × ${barBox?.y}`);
  ok("sem rolagem horizontal com a barra", await mob.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  const before2 = await loadNow();
  await mic.click();
  const sheet = mob.getByRole("dialog", { name: "Comando por voz (IA)" });
  ok("voz do navegador preenche o comando", await until(async () => (await sheet.getByLabel("O que mudar").inputValue()).includes("Camila")));
  await sheet.getByRole("button", { name: "Enviar" }).click();
  if (camilas > 1) {
    const choose = sheet.getByTestId("coach-choose");
    ok("2+ alunos com o nome: pergunta qual", await visible(choose, 25000));
    await choose.getByRole("button", { name: "Camila Freitas" }).click();
  }
  const prop = sheet.getByTestId("coach-proposal");
  ok("proposta com o nome completo do aluno", await visible(prop.getByText("Para Camila Freitas"), 25000));
  ok("antes → depois", (await prop.innerText()).includes(`${String(before2).replace(".", ",")} → ${String(before2 + 2.5).replace(".", ",")}`), await prop.innerText());
  ok("proposta não grava sozinha", (await loadNow()) === before2);
  await mob.screenshot({ path: `${OUT}/comando-ia-02-microfone-375.png` });
  await prop.getByRole("button", { name: "Aplicar alterações" }).click();
  ok("microfone: aplicado", await toast(mob, "Alterações aplicadas."));
  ok("banco: +2,5 pelo microfone", await until(async () => (await loadNow()) === before2 + 2.5));
  ok("microfone sem erro de página", mob.errors.length === 0, mob.errors.join(" | "));
  await mob.context().close();

  // Sem reconhecimento de voz: campo de texto com instrução do ditado do teclado; escopo e aluno não encontrado.
  const noVoice = await newMobile(null);
  await noVoice.goto(`${BASE}/alunos`);
  await noVoice.getByTestId("coach-mic-bar").getByRole("button", { name: "Comando por voz" }).click();
  const s2 = noVoice.getByRole("dialog", { name: "Comando por voz (IA)" });
  ok("sem suporte: instrução do ditado do teclado", await visible(s2.getByText("use o microfone do teclado")));
  await s2.getByLabel("O que mudar").fill("manda mensagem pra Camila");
  await s2.getByRole("button", { name: "Enviar" }).click();
  ok("pedido fora da prescrição: 'ainda não faço isso'", await visible(s2.getByText("Ainda não faço isso"), 15000));
  await s2.getByLabel("O que mudar").fill(`${key} da Xuxaninha mais 2 kg`);
  await s2.getByRole("button", { name: "Enviar" }).click();
  ok("aluno não encontrado", await visible(s2.getByText("Não encontrei esse aluno"), 15000));
  ok("nada mudou", (await loadNow()) === before2 + 2.5);
  await noVoice.context().close();

  // Desktop: sem a barra (só celular).
  const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await dctx.addCookies(cookies);
  const desk = await dctx.newPage();
  await desk.goto(`${BASE}/alunos`);
  await desk.getByRole("main").waitFor();
  ok("desktop: barra do microfone não aparece", !(await desk.getByTestId("coach-mic-bar").isVisible()));
  await dctx.close();
} catch (e) {
  ok("roteiro terminou", false, e.message);
} finally {
  await admin.from("organizations").update({ ai_coach_enabled: false, plan: orgRow.plan }).eq("id", org);
  for (const o of original) await admin.from("plan_workout_items").update({ sets: o.sets, quantity_min: o.quantity_min, quantity_max: o.quantity_max, load_value: o.load_value }).eq("id", o.id);
  await admin.from("prescription_changes").delete().eq("student_id", camila);
  const { data: still } = await admin.from("organizations").select("ai_coach_enabled").eq("id", org).single();
  ok("flag desligada de novo no fim", still.ai_coach_enabled === false);
  await browser.close();
}
process.exit(fails ? 1 : 0);
