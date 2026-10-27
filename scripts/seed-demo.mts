/**
 * Dados de DEMONSTRAÇÃO do Início (dashboard), 100% fictícios, só no lfit-dev:
 *
 *   npm run db:seed:demo        cria ~90 dias de sessões de treino na organização de exemplo
 *
 * Separado do `npm run db:seed` de propósito: os roteiros e2e (ex.: f3, que espera a Camila sem treinos) dependem do seed
 * padrão. Rode DEPOIS do seed. Repetível sem apagar nada: se a demonstração já existir (sessões marcadas no `snapshot`),
 * não faz nada — para recriar, refaça o seed (`npm run db:seed -- --reset`, que recria a organização) e rode de novo.
 * Nunca toca nas contas de app (Camila, Ana, Diego) nem em sessões que não sejam de demonstração.
 *
 * Perfis: assíduos (3×/semana nos 90 dias), irregulares (1×/semana), parados (só entre 45 e 90 dias atrás) e quem
 * voltou depois de uma pausa; ~40% das sessões concluídas com nota de satisfação (1 a 5).
 */
import { createClient } from "@supabase/supabase-js";
import { assertDevProject } from "./dev-guard.mts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !serviceKey) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY.");
  process.exit(1);
}
assertDevProject(url);

const SLUG = "studio-exemplo";
const DEMO = { demo: true };
const APP_EMAILS = ["aluno.seed@example.com", "aluno.suspenso.seed@example.com", "aluno.consentimento.seed@example.com"];
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

/** Gerador determinístico (a demo fica igual a cada execução, a menos da data de hoje). */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

/** Instante em São Paulo (UTC−3): `dias` atrás, na hora/minuto dados. */
function spAt(daysAgo: number, hour: number, minute: number) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - daysAgo, hour + 3, minute));
}

type Profile = "assiduo" | "irregular" | "parado" | "voltou";
const PROFILES: Profile[] = ["assiduo", "assiduo", "irregular", "parado", "voltou", "irregular", "assiduo", "parado"];

/** Dias (atrás) em que o aluno treinou, conforme o perfil. */
function trainingDays(profile: Profile, rand: () => number): number[] {
  const days: number[] = [];
  for (let ago = 90; ago >= 0; ago--) {
    const weekday = (new Date(Date.now() - ago * 86_400_000).getUTCDay() + 6) % 7; // 0 = segunda
    const p =
      profile === "assiduo" ? ([0, 2, 4].includes(weekday) ? 0.85 : 0.05)
      : profile === "irregular" ? (weekday === 1 ? 0.6 : 0.04)
      : profile === "parado" ? (ago >= 45 && [0, 3].includes(weekday) ? 0.7 : 0)
      : /* voltou */ (ago >= 50 || ago <= 20) && [1, 3].includes(weekday) ? 0.75 : 0;
    if (rand() < p) days.push(ago);
  }
  return days;
}

async function main() {
  const { data: org } = await admin.from("organizations").select("id, is_seed").eq("slug", SLUG).maybeSingle();
  if (!org) throw new Error(`Organização "${SLUG}" não existe: rode npm run db:seed antes.`);
  if (!org.is_seed) throw new Error(`Recusado: "${SLUG}" não está marcada como seed (is_seed=false).`);

  // Contas de app ficam de fora (os roteiros do app do aluno esperam o estado do seed padrão).
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const appUserIds = new Set((users?.users ?? []).filter((u) => u.email && APP_EMAILS.includes(u.email)).map((u) => u.id));
  const { data: students, error } = await admin
    .from("students")
    .select("id, user_id, enrollment_number, status")
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .order("enrollment_number");
  if (error) throw error;
  const eligible = (students ?? []).filter((s) => !s.user_id || !appUserIds.has(s.user_id)).slice(0, 16);

  const existing = await admin
    .from("workout_sessions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.id)
    .contains("snapshot", DEMO);
  if (existing.error) throw existing.error;
  if (existing.count) {
    console.log(`A demonstração já existe (${existing.count} sessões): nada a fazer. Para recriar, rode npm run db:seed -- --reset e depois este comando.`);
    return;
  }

  const rand = rng(20261020);
  const rows: Record<string, unknown>[] = [];
  eligible.forEach((s, i) => {
    const profile = PROFILES[i % PROFILES.length];
    for (const ago of trainingDays(profile, rand)) {
      const label = ["A", "B", "C"][rows.length % 3];
      const start = spAt(ago, 6 + Math.floor(rand() * 14), Math.floor(rand() * 60));
      const abandoned = rand() < 0.08;
      const end = new Date(start.getTime() + (45 + Math.floor(rand() * 30)) * 60_000);
      // Não cria treino "concluído" no futuro (hoje, depois de agora).
      const completed = !abandoned && end.getTime() <= Date.now();
      rows.push({
        organization_id: org.id,
        student_id: s.id,
        workout_label: label,
        workout_name: { A: "Peito e tríceps", B: "Costas e bíceps", C: "Pernas" }[label],
        snapshot: DEMO,
        status: completed ? "completed" : "abandoned",
        started_at: start.toISOString(),
        finished_at: completed ? end.toISOString() : null,
        rpe: completed ? 5 + Math.floor(rand() * 5) : null,
        student_rating: completed && rand() < 0.4 ? [5, 5, 4, 4, 4, 3, 5, 2][Math.floor(rand() * 8)] : null,
      });
    }
  });

  for (let i = 0; i < rows.length; i += 200) {
    const { error: e } = await admin.from("workout_sessions").insert(rows.slice(i, i + 200));
    if (e) throw e;
  }
  const done = rows.filter((r) => r.status === "completed").length;
  const rated = rows.filter((r) => r.student_rating !== null).length;
  console.log(`Demo do Início: ${rows.length} sessões em ${eligible.length} alunos (${done} concluídas, ${rated} com nota).`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
