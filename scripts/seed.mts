/**
 * Seed de DESENVOLVIMENTO com dados 100% fictícios.
 *
 *   npm run db:seed            cria a organização de exemplo
 *   npm run db:seed -- --reset apaga a organização/usuários de exemplo e recria
 *
 * Requer em .env.local: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
 * SUPABASE_SECRET_KEY, SEED_USER_PASSWORD (senha dos usuários de exemplo) e ALLOW_DB_TESTS=true.
 * Recusa rodar fora do lfit-dev (ver scripts/dev-guard.mts).
 *
 * Os alunos são criados pelas mesmas RPCs do app (logado como o owner de
 * exemplo), então passam por limite do plano, matrícula e auditoria.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertDevProject } from "./dev-guard.mts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SECRET_KEY;
const password = process.env.SEED_USER_PASSWORD;

if (!url || !anonKey || !serviceKey || !password) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY e SEED_USER_PASSWORD.");
  process.exit(1);
}

assertDevProject(url);

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

/** Para escritas sem retorno (insert sem select, RPC void): só verifica o erro. */
function ok(result: { error: { message: string } | null }, what: string) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
}

async function removeOrgPhotos(orgId: string, bucketName = "student-photos") {
  const bucket = admin.storage.from(bucketName);
  const { data: folders } = await bucket.list(orgId, { limit: 1000 });
  for (const folder of folders ?? []) {
    const { data: files } = await bucket.list(`${orgId}/${folder.name}`, { limit: 1000 });
    const paths = (files ?? []).map((f) => `${orgId}/${folder.name}/${f.name}`);
    if (paths.length) await bucket.remove(paths);
  }
}

async function reset() {
  const { data: org } = await admin.from("organizations").select("id").eq("slug", SLUG).maybeSingle();
  if (org) {
    // Contas de acesso criadas para alunos (link de acesso/convite) também saem.
    const { data: studentUsers } = await admin.from("students").select("user_id").eq("organization_id", org.id).not("user_id", "is", null);
    for (const s of studentUsers ?? []) await admin.auth.admin.deleteUser(s.user_id as string);
    // Fotos no Storage não são apagadas em cascata: remove a pasta da organização.
    await removeOrgPhotos(org.id);
    await removeOrgPhotos(org.id, "exercise-media");
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

const pick = <T,>(list: readonly T[], i: number) => list[i % list.length];
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

/** Fase 2: condições ligadas aos grupos, camada de contraindicações da org (fictícia) e treinos. */
async function seedTraining(owner: SupabaseClient, orgId: string, [coluna, joelho, ombro]: string[], ids: string[]) {
  const conds = must(await owner.from("health_conditions").select("id, key").not("key", "is", null), "condições") as { id: string; key: string }[];
  const cond = (key: string) => conds.find((c) => c.key === key)!.id;
  const hernia = must(
    await owner.from("health_conditions").insert({ organization_id: orgId, name: "Hérnia – intolerância à flexão" }).select("id").single(),
    "condição própria",
  ).id;
  ok(
    await owner.from("special_group_conditions").insert([
      { organization_id: orgId, group_id: coluna, condition_id: cond("lombar") },
      { organization_id: orgId, group_id: coluna, condition_id: hernia },
      { organization_id: orgId, group_id: joelho, condition_id: cond("joelho") },
      { organization_id: orgId, group_id: ombro, condition_id: cond("ombro") },
    ]),
    "grupos ↔ condições",
  );

  const exs = must(await owner.from("exercises").select("id, name").is("organization_id", null), "exercícios") as { id: string; name: string }[];
  const ex = (name: string) => {
    const found = exs.find((e) => e.name === name);
    if (!found) throw new Error(`Exercício não encontrado: ${name}`);
    return found.id;
  };

  // Exemplos para exercitar os alertas no dev — NÃO são as regras globais (essas só após revisão).
  ok(
    await owner.from("exercise_contraindications").insert([
      { organization_id: orgId, exercise_id: ex("Abdominal supra"), condition_id: hernia, level: "avoid", note: "Flexão repetida da coluna (exemplo do seed)" },
      { organization_id: orgId, exercise_id: ex("Agachamento livre com barra"), condition_id: cond("lombar"), level: "caution", note: "Carga axial; preferir goblet (exemplo do seed)" },
      { organization_id: orgId, exercise_id: ex("Levantamento terra romeno"), condition_id: hernia, level: "avoid", note: "Flexão de quadril sob carga (exemplo do seed)" },
      { organization_id: orgId, exercise_id: ex("Cadeira extensora"), condition_id: cond("joelho"), level: "caution", note: "Limitar amplitude final (exemplo do seed)" },
      { organization_id: orgId, exercise_id: ex("Tríceps no banco"), condition_id: cond("ombro"), level: "avoid", note: "Extensão de ombro sob carga (exemplo do seed)" },
    ]),
    "contraindicações da organização",
  );

  const item = (name: string, extra: Record<string, unknown> = {}) => ({ exercise_id: ex(name), sets: 3, reps: "10–12", rest_seconds: 60, ...extra });
  const hipertrofia = must(
    await owner.rpc("save_training_plan", {
      p_plan: {
        name: "Hipertrofia ABC",
        goal: "Hipertrofia",
        level: "intermediario",
        workouts: [
          {
            label: "A",
            name: "Peito, ombro e tríceps",
            items: [
              item("Supino reto com barra", { sets: 4, reps: "8–10", load_value: 40, load_unit: "kg", rest_seconds: 90 }),
              item("Crucifixo com halteres", { group_key: "bi1" }),
              item("Crossover na polia", { group_key: "bi1" }),
              item("Desenvolvimento com halteres"),
              item("Tríceps na polia", { group_key: "bi2" }),
              item("Tríceps no banco", { group_key: "bi2" }),
            ],
          },
          {
            label: "B",
            name: "Costas e bíceps",
            items: [
              item("Puxada frontal na polia", { sets: 4 }),
              item("Remada baixa sentada na polia"),
              item("Rosca direta com barra", { group_key: "bi1" }),
              item("Rosca martelo", { group_key: "bi1" }),
            ],
          },
          {
            label: "C",
            name: "Pernas",
            items: [
              item("Agachamento livre com barra", { sets: 4, reps: "8–10", rest_seconds: 120, tempo: "3010" }),
              item("Leg press 45°"),
              item("Cadeira extensora", { group_key: "tri1" }),
              item("Mesa flexora", { group_key: "tri1" }),
              item("Panturrilha em pé", { group_key: "tri1", reps: "15" }),
              item("Abdominal supra", { reps: "20" }),
            ],
          },
        ],
      },
    }),
    "modelo Hipertrofia ABC",
  ) as string;

  const coluna_ = must(
    await owner.rpc("save_training_plan", {
      p_plan: {
        name: "Coluna saudável",
        goal: "Estabilidade de tronco e controle motor",
        level: "iniciante",
        notes: "Progredir carga só sem dor (≤ 3/10) nas 24h seguintes.",
        workouts: [
          {
            label: "A",
            name: "Estabilidade",
            items: [
              item("Dead bug", { reps: "8 por lado", rest_seconds: 45 }),
              item("Bird dog", { reps: "8 por lado", rest_seconds: 45 }),
              item("Prancha lateral", { reps: "20–30 s", rest_seconds: 45 }),
              item("Pallof press", { reps: "10 por lado" }),
            ],
          },
          {
            label: "B",
            name: "Força com coluna neutra",
            items: [
              item("Agachamento goblet", {
                reps: "10",
                sets_detail: [
                  { set_type: "warmup", reps: "12", load_value: 8, load_unit: "kg", rest_seconds: 45 },
                  { set_type: "work", reps: "10", load_value: 14, load_unit: "kg", rest_seconds: 75 },
                  { set_type: "work", reps: "10", load_value: 14, load_unit: "kg", rest_seconds: 75 },
                ],
              }),
              item("Elevação pélvica", {
                sets_detail: [
                  { set_type: "warmup", reps: "12", load_text: "sem carga" },
                  { set_type: "work", reps: "10", load_value: 30, load_unit: "kg" },
                  { set_type: "drop", reps: "até a falha", load_value: 20, load_unit: "kg" },
                ],
              }),
              item("Remada unilateral com halter"),
              item("Levantamento terra romeno", { notes: "Somente sem dor lombar" }),
            ],
          },
        ],
      },
    }),
    "modelo Coluna saudável",
  ) as string;

  // Planos de alunos: ativo em dia, ativo a vencer, ativo vencido e um rascunho.
  const assign = async (template: string, student: string, startsIn: number, endsIn: number, activate = true) => {
    const plan = must(
      await owner.rpc("apply_template_to_student", { p_template_id: template, p_student_id: student, p_starts_on: dateOnly(startsIn), p_ends_on: dateOnly(endsIn) }),
      "aplicar modelo",
    ) as string;
    if (activate) ok(await owner.rpc("activate_plan", { p_plan_id: plan }), "ativar plano");
  };
  await assign(coluna_, ids[0], -10, 50); // Dor na Coluna → alertas
  await assign(hipertrofia, ids[4], -30, 4); // Dor no Joelho, a vencer
  await assign(hipertrofia, ids[1], -60, -3); // vencido
  await assign(hipertrofia, ids[2], -5, 55);
  await assign(coluna_, ids[12], 0, 60, false); // rascunho
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

  ok(
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
    ok(await admin.from("payments").insert({ organization_id: org.id, student_id: id, amount_cents: 18000, due_date: dateOnly(-12) }), "pagamento vencido");
  }
  ok(await admin.from("payments").insert({ organization_id: org.id, student_id: ids[15], amount_cents: 18000, due_date: dateOnly(-2) }), "pagamento na carência");

  const toDelete = fakeStudent(28);
  ok(await owner.rpc("soft_delete_student", { p_student_id: ids[28], p_confirm_name: `${toDelete.first_name} ${toDelete.last_name}` }), "excluir");

  // Turmas
  ok(
    await owner.from("class_students").insert([
      ...ids.slice(0, 8).map((id) => ({ class_id: classes[0].id, student_id: id, organization_id: org.id })),
      ...ids.slice(8, 14).map((id) => ({ class_id: classes[1].id, student_id: id, organization_id: org.id })),
    ]),
    "vincular turmas",
  );

  // Consentimento de saúde: metade dos alunos com grupo já confirmou como titular;
  // os demais têm só a declaração do professor (dados visíveis apenas ao responsável).
  const withGroups = ids.filter((_, i) => i % 4 === 0);
  const confirmed = withGroups.filter((_, i) => i % 2 === 0);
  ok(await admin.from("students").update({ health_data_consent_at: new Date().toISOString() }).in("id", confirmed), "consentimento do titular");

  // Link público ativo + cadastros pendentes fictícios.
  const link = must(await owner.rpc("ensure_signup_link"), "link público") as { token: string };
  ok(await owner.from("public_signup_links").update({ is_active: true }).eq("organization_id", org.id), "ativar link");
  const pendentes = [
    { payload: { first_name: "Laura", last_name: "Pendente", email: "laura.pendente@example.com", birth_date: "1994-03-08", whatsapp_e164: "+5541988887777", health_description: "Tenho hérnia de disco lombar (L5-S1), sem crise há 6 meses." }, consent: true },
    { payload: { first_name: "Mário", last_name: "Pendente", email: "mario.pendente@example.com", sex: "M" }, consent: false },
    { payload: { first_name: "Nina", last_name: "Pendente", email: "nina.pendente@example.com", birth_date: "2001-11-20" }, consent: false },
  ];
  for (const pnd of pendentes) {
    ok(await admin.rpc("submit_public_signup", { p_token: link.token, p_payload: pnd.payload, p_consent: pnd.consent }), "cadastro pendente");
  }

  await seedTraining(owner, org.id, groups.map((g) => g.id), ids);

  const [usage] = must(await owner.rpc("organization_plan_usage"), "uso do plano") as { used: number; student_limit: number }[];
  console.log(`Seed concluído: ${ids.length} alunos (${usage.used}/${usage.student_limit} vagas ocupadas).`);
  console.log("Usuários de exemplo (senha = SEED_USER_PASSWORD):");
  for (const u of Object.values(USERS)) console.log(`  ${u.role.padEnd(7)} ${u.email}`);
}

if (process.argv.includes("--reset")) await reset();
await seed();
