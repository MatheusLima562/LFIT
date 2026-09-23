/**
 * Cria uma organização e o seu primeiro owner, e imprime um link de convite
 * (definir senha). Não envia e-mail: o link aparece só no terminal.
 *
 *   npm run bootstrap:owner
 *   npm run bootstrap:owner -- --org "Studio X" --name "Fulano" --email fulano@x.com
 *
 * Requer em .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY e
 * NEXT_PUBLIC_SITE_URL (URL pública do app; ex.: http://localhost:3000).
 */
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline/promises";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY;
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
if (!url || !serviceKey) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY no .env.local.");
  process.exit(1);
}

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = async (name: string, question: string) => arg(name) ?? (await rl.question(question)).trim();
const orgName = await ask("org", "Nome do estúdio/consultoria: ");
const fullName = await ask("name", "Nome do responsável (owner): ");
const email = (await ask("email", "E-mail do owner: ")).toLowerCase();
rl.close();

if (orgName.length < 2 || fullName.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Dados inválidos.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const slugBase = orgName
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 40);
const slug = `${slugBase || "conta"}-${randomUUID().slice(0, 6)}`;

// generateLink("invite") cria o usuário (ainda sem senha) e devolve o token.
const link = await admin.auth.admin.generateLink({ type: "invite", email });
if (link.error) {
  console.error(`Não foi possível criar o convite: ${link.error.message}`);
  process.exit(1);
}
const userId = link.data.user.id;

const org = await admin.from("organizations").insert({ name: orgName, slug }).select("id").single();
const profile = org.data
  ? await admin.from("profiles").insert({ id: userId, organization_id: org.data.id, role: "owner", full_name: fullName })
  : null;

if (org.error || profile?.error) {
  await admin.auth.admin.deleteUser(userId);
  if (org.data) await admin.from("organizations").delete().eq("id", org.data.id);
  console.error(`Falhou: ${org.error?.message ?? profile?.error?.message}`);
  process.exit(1);
}

const inviteUrl = `${siteUrl}/auth/confirm?token_hash=${link.data.properties.hashed_token}&type=invite&next=/convite`;
console.log(`\nOrganização "${orgName}" criada (slug: ${slug}).`);
console.log(`Owner: ${fullName} <${email}>`);
console.log(`\nLink para definir a senha (uso único; validade = OTP expiry do Supabase Auth):\n${inviteUrl}\n`);
