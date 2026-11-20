/**
 * Limpa no lfit-dev os usuários e organizações criados pelos testes (tests/db e e2e) que sobraram de execuções
 * interrompidas. Só dados de teste (ver scripts/test-data-filters.mts); nunca o seed nem dado real.
 *
 *   npm run db:cleanup-tests            # só lista o que seria apagado (padrão)
 *   npm run db:cleanup-tests -- --apply # apaga: organizações de teste (cascata) e depois os usuários do Auth
 *
 * Trava: recusa fora do lfit-dev (fwbpazxawtxuppuczijd) — mesma de `scripts/dev-guard.mts` (URL do .env.local, lista de
 * projetos de dev e projeto linkado no CLI) + conferência explícita do ref.
 */
import { createClient } from "@supabase/supabase-js";
import { LFIT_DEV_PROJECT_REF, assertDevProject, projectRefFromUrl } from "./dev-guard.mts";
import { isTestOrg, isTestUserEmail } from "./test-data-filters.mts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assertDevProject(url);
if (projectRefFromUrl(url) !== LFIT_DEV_PROJECT_REF) {
  console.error(`Recusado: só roda no lfit-dev (${LFIT_DEV_PROJECT_REF}).`);
  process.exit(1);
}
const serviceKey = process.env.SUPABASE_SECRET_KEY;
if (!serviceKey) {
  console.error("Defina SUPABASE_SECRET_KEY no .env.local.");
  process.exit(1);
}
const apply = process.argv.includes("--apply");
const admin = createClient(url!, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const users: { id: string; email: string }[] = [];
for (let page = 1; ; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw new Error(`listar usuários: ${error.message}`);
  for (const u of data.users) if (isTestUserEmail(u.email)) users.push({ id: u.id, email: u.email! });
  if (data.users.length < 1000) break;
}
const { data: orgRows, error: orgError } = await admin.from("organizations").select("id, name, is_seed");
if (orgError) throw new Error(`listar organizações: ${orgError.message}`);
const orgs = (orgRows ?? []).filter(isTestOrg);

console.log(`${apply ? "Apagando" : "Seriam apagados (simulação; use --apply)"}: ${orgs.length} organizações de teste e ${users.length} usuários de teste.`);
if (!apply) process.exit(0);

let removedOrgs = 0, removedUsers = 0;
for (const o of orgs) {
  const { error } = await admin.from("organizations").delete().eq("id", o.id);
  if (!error) removedOrgs++;
}
for (const u of users) {
  const { error } = await admin.auth.admin.deleteUser(u.id);
  if (!error) removedUsers++;
}
console.log(`Apagados: ${removedOrgs} organizações e ${removedUsers} usuários.`);
