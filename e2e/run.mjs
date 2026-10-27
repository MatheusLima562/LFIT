/**
 * Executa os roteiros e2e em série (padrão: todos; ou os que contiverem os filtros passados).
 *   node --env-file=.env.local e2e/run.mjs                 # todos
 *   node --env-file=.env.local e2e/run.mjs k210 inicio     # só os que casarem
 *   ... --no-reseed                                        # não refaz o seed entre roteiros (mais rápido)
 * Antes de cada roteiro: refaz o seed (os roteiros esperam o estado inicial; os da Fase 1 alteram alunos) e limpa
 * public.rate_limits (muitos logins seguidos) — só no lfit-dev (trava em _guard.mjs e no próprio seed).
 */
import "./_guard.mjs";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const reseed = !args.includes("--no-reseed");
const filters = args.filter((a) => !a.startsWith("--"));
const files = readdirSync("e2e")
  .filter((f) => f.endsWith(".e2e.mjs"))
  .filter((f) => !filters.length || filters.some((x) => f.includes(x)))
  .sort();

const results = [];
for (const file of files) {
  if (reseed) {
    const seed = spawnSync("npm", ["run", "db:seed", "--", "--reset"], { env: process.env, encoding: "utf8" });
    if (seed.status !== 0) {
      console.error(`Seed falhou antes de ${file}:\n${seed.stdout}${seed.stderr}`);
      process.exit(1);
    }
  }
  await admin.from("rate_limits").delete().neq("key", "");
  const started = Date.now();
  const r = spawnSync(process.execPath, [`e2e/${file}`], { env: process.env, encoding: "utf8" });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const failed = out.split("\n").filter((l) => l.startsWith("✗"));
  const ok = r.status === 0 && failed.length === 0;
  results.push({ file, ok, secs: Math.round((Date.now() - started) / 1000) });
  console.log(`${ok ? "✓" : "✗"} ${file} (${results.at(-1).secs}s)`);
  if (!ok) console.log(failed.length ? failed.map((l) => `    ${l}`).join("\n") : out.split("\n").slice(-12).map((l) => `    ${l}`).join("\n"));
}
const bad = results.filter((r) => !r.ok);
console.log(`\nResumo:\n${results.map((r) => `${r.ok ? "✓" : "✗"} ${r.file}`).join("\n")}`);
console.log(`\n${results.length - bad.length}/${results.length} roteiros ok. Capturas em ${process.env.OUT}.`);
process.exit(bad.length ? 1 : 0);
