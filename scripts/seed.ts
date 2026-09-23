/**
 * Seed de DESENVOLVIMENTO com dados 100% fictícios.
 *
 *   npm run db:seed            cria a organização de exemplo
 *   npm run db:seed -- --reset apaga a organização/usuários de exemplo e recria
 *
 * Requer em .env.local: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
 * SUPABASE_SECRET_KEY e SEED_USER_PASSWORD (senha dos usuários de exemplo).
 *
 * Os alunos são criados pelas mesmas RPCs do app (logado como o owner de
 * exemplo), então passam por limite do plano, matrícula e auditoria.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SECRET_KEY;
const password = process.env.SEED_USER_PASSWORD;

if (!url || !anonKey || !serviceKey || !password) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY e SEED_USER_PASSWORD.");
  process.exit(1);
}

const SLUG = "studio-exemplo";
const USERS = {
  owner: { email: "owner.seed@example.com", name: "Rafael Exemplo", role: "owner" },
  trainer1: { email: "trainer1.seed@example.com", name: "Bianca Exemplo", role: "trainer" },
  trainer2: { email: "trainer2.seed@example.com", name: "Caio Exemplo", role: "trainer" },
} as const;

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);

function must<R extends { data: unknown; error: { message: string } | null }>(result: R, what: string): NonNullable<R["data"]> {
  if (result.error || result.data === null) throw new Error(`${what}: ${result.error?.message ?? "sem dados"}`);
  return result.data as NonNullable<R["data"]>;
}

async function reset() {
  const { data: org } = await admin.from("organizations").select("id").eq("slug", SLUG).maybeSingle();
  if (org) {
    const { error } = await admin.from("organizations").delete().eq("id", org.id);
    if (error) throw new Error(`apagar organização: ${error.message}`);
  }

  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const seedEmails = new Set<string>(Object.values(USERS).map((u) => u.email));
  for (const user of data?.users ?? []) {
    if (user.email && seedEmails.has(user.email)) await admin.auth.admin.deleteUser(user.id);
  }
  console.log("Dados de exemplo removidos.");
}

async function createUser(orgId: string, user: (typeof USERS)[keyof typeof USERS]) {
  const created = await admin.auth.admin.createUser({ email: user.email, password: password!, email_confirm: true });
  if (created.error) throw new Error(`criar usuário ${user.email}: ${created.error.message}`);
  const id = created.data.user.id;
  const profile = await admin.from("profiles").insert({ id, organization_id: orgId, role: user.role, full_name: user.name });
  if (profile.error) throw new Error(`criar perfil ${user.email}: ${profile.error.message}`);
  return id;
}

async function signIn(email: string): Promise<SupabaseClient> {
  const client = createClient(url!, anonKey!, noSession);
  const { error } = await client.auth.signInWithPassword({ email, password: password! });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return client;
}

// --- Dados fictícios --------------------------------------------------------
const FIRST = ["Ana", "Bruno", "Camila", "Diego", "Elisa", "Fábio", "Gabriela", "Heitor", "Isabela", "João",
  "Larissa", "Marcos", "Natália", "Otávio", "Paula", "Renato", "Sofia", "Tiago", "Úrsula", "Vinícius"];
const LAST = ["Almeida", "Barbosa", "Cardoso", "Duarte", "Esteves", "Freitas", "Gonçalves", "Henriques",
  "Jardim", "Lacerda", "Moura", "Nogueira"];
const LOCATIONS = ["Academia Centro", "Condomínio Jardins", "Online", "Studio"];

const pick = <T>(list: readonly T[], i: number) => list[i % list.length];
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const dateOnly = (n: number) => daysFromNow(n).slice(0, 10);

function fakeStudent(i: number) {
  const first = pick(FIRST, i);
  const last = pick(LAST, i * 7 + 3);
  const ascii = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return {
    first_name: first,
    last_name: last,
    email: `${ascii(first)}.${ascii(last)}.${i}@example.com`,
    whatsapp_e164: `+55419${String(90000000 + i * 1379).slice(0, 8)}`,
    birth_date: `${1965 + (i % 40)}-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`,
    sex: i % 2 === 0 ? "F" : "M",
    training_location: pick(LOCATIONS, i),
  };
}

async function seed() {
  const existing = await admin.from("organizations").select("id").eq("slug", SLUG).maybeSingle();
  if (existing.data) {
    console.error(`Organização "${SLUG}" já existe. Use --reset para recriar.`);
    process.exit(1);
  }

  const org = must(
    await admin.from("organizations").insert({ name: "Studio Exemplo (fictício)", slug: SLUG, plan: "pro", student_limit: 50 }).select("id").single(),
    "criar organização",
  );

  const ownerId = await createUser(org.id, USERS.owner);
  const trainer1Id = await createUser(org.id, USERS.trainer1);
  const trainer2Id = await createUser(org.id, USERS.trainer2);
  const owner = await signIn(USERS.owner.email);

  const groups = must(
    await owner.from("special_groups").insert([
      { organization_id: org.id, name: "Dor na Coluna", color: "#f0642d" },
      { organization_id: org.id, name: "Dor no Joelho", color: "#7c5cfc" },
      { organization_id: org.id, name: "Dor no Ombro", color: "#1ba39c" },
    ]).select("id"),
    "criar grupos",
  );

  const classes = must(
    await owner.from("classes").insert([
      { organization_id: org.id, name: "Funcional manhã", trainer_id: trainer1Id },
      { organization_id: org.id, name: "Coluna saudável", trainer_id: trainer2Id },
    ]).select("id"),
    "criar turmas",
  );

  must(
    await owner.from("anamnesis_templates").insert({
      organization_id: org.id,
      title: "Anamnese padrão",
      questions: [
        { id: "objetivo", label: "Qual o seu objetivo principal?", type: "text" },
        { id: "dor", label: "Sente dor em alguma região?", type: "text" },
        { id: "cirurgia", label: "Já fez alguma cirurgia?", type: "boolean" },
      ],
    }),
    "criar modelo de anamnese",
  );

  const trainers = [ownerId, trainer1Id, trainer2Id];
  const ids: string[] = [];
  for (let i = 0; i < 40; i++) {
    const withGroup = i % 4 === 0;
    const student = must(
      await owner.rpc("create_student", {
        p_data: {
          ...fakeStudent(i),
          trainer_id: pick(trainers, i),
          block_if_overdue: i % 5 === 0,
          ...(withGroup ? { group_ids: [pick(groups, i).id], health_data_consent: true } : {}),
        },
      }),
      `criar aluno ${i}`,
    ) as { id: string };
    ids.push(student.id);
  }

  // Variedade de status: 6 inativos, 5 expirados, 4 expirando em até 7 dias,
  // 3 bloqueados (inadimplentes além da carência), 1 excluído.
  const act = async (fn: string, id: string) => must(await owner.rpc(fn, { p_student_id: id }), fn);
  for (const id of ids.slice(30, 36)) await act("deactivate_student", id);
  for (const id of ids.slice(36, 40)) await act("expire_student", id);
  await act("expire_student", ids[29]);
  for (const [n, id] of ids.slice(20, 24).entries()) {
    must(await owner.rpc("update_student", { p_student_id: id, p_patch: { access_expires_at: daysFromNow(n * 2 + 1) } }), "expirando");
  }
  for (const id of [ids[0], ids[5], ids[10]]) {
    must(await admin.from("payments").insert({ organization_id: org.id, student_id: id, amount_cents: 18000, due_date: dateOnly(-12) }), "pagamento vencido");
  }
  must(await admin.from("payments").insert({ organization_id: org.id, student_id: ids[15], amount_cents: 18000, due_date: dateOnly(-2) }), "pagamento na carência");

  const toDelete = fakeStudent(28);
  must(await owner.rpc("soft_delete_student", { p_student_id: ids[28], p_confirm_name: `${toDelete.first_name} ${toDelete.last_name}` }), "excluir");

  // Turmas
  must(
    await owner.from("class_students").insert([
      ...ids.slice(0, 8).map((id) => ({ class_id: classes[0].id, student_id: id, organization_id: org.id })),
      ...ids.slice(8, 14).map((id) => ({ class_id: classes[1].id, student_id: id, organization_id: org.id })),
    ]),
    "vincular turmas",
  );

  const [usage] = must(await owner.rpc("organization_plan_usage"), "uso do plano") as { used: number; student_limit: number }[];
  console.log(`Seed concluído: ${ids.length} alunos (${usage.used}/${usage.student_limit} vagas ocupadas).`);
  console.log("Usuários de exemplo (senha = SEED_USER_PASSWORD):");
  for (const u of Object.values(USERS)) console.log(`  ${u.role.padEnd(7)} ${u.email}`);
}

if (process.argv.includes("--reset")) await reset();
await seed();
