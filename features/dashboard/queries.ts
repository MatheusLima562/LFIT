import "server-only";
import { createClient } from "@/lib/db/server";
import { listStudents } from "@/features/students/queries";
import { studentListHref, type PlanFilter } from "@/features/students/search-params";
import type { StatTab, StudentRef } from "@/types/dashboard";
import { dueMeta, sinceMeta, startOfTodaySP } from "./meta";

/** Quantos nomes cada aba do Início mostra (o total vem à parte). */
const LIST_LIMIT = 4;
const DAY_MS = 86_400_000;

/**
 * Acompanhamento (dados reais): mesmos filtros de "Meus alunos" (?treino=), entre os alunos da aba Ativos.
 * RLS: owner vê a organização; professor, os seus alunos.
 */
export async function getTrackingTabs(): Promise<StatTab[]> {
  const tab = async (treino: PlanFilter): Promise<{ items: StudentRef[]; count: number }> => {
    const { rows, total } = await listStudents(
      { status: "active", sort: "name:asc", treino, page: 1, q: undefined, turma: undefined, grupo: undefined },
      { limit: LIST_LIMIT },
    );
    return {
      count: total,
      items: rows.map((r) => ({
        id: r.id,
        name: r.fullName,
        meta: r.workoutPlanEndsAt ? dueMeta(r.workoutPlanEndsAt) : "sem treino ativo",
      })),
    };
  };
  const [aVencer, vencido, semTreino] = await Promise.all([tab("a_vencer"), tab("vencido"), tab("sem_treino")]);
  return [
    { id: "a-vencer", label: "A vencer", tone: "warning", emptyMessage: "Nenhum aluno com treino vencendo nos próximos 7 dias.", href: studentListHref({ treino: "a_vencer" }), ...aVencer },
    { id: "vencidos", label: "Vencidos", tone: "danger", emptyMessage: "Nenhum aluno com treino vencido.", href: studentListHref({ treino: "vencido" }), ...vencido },
    { id: "sem-treino", label: "Sem treino", emptyMessage: "Todos os alunos ativos têm um treino.", href: studentListHref({ treino: "sem_treino" }), ...semTreino },
  ];
}

/** Novos alunos por students.created_at (hoje em São Paulo, 7 e 30 dias), sem excluídos. */
export async function getNewStudentTabs(now = new Date()): Promise<StatTab[]> {
  const supabase = await createClient();
  const since = async (fromIso: string) => {
    const { data, count } = await supabase
      .from("students")
      .select("id, first_name, last_name, created_at", { count: "exact" })
      .is("deleted_at", null)
      .gte("created_at", fromIso)
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT);
    return {
      count: count ?? 0,
      items: (data ?? []).map((s) => ({ id: s.id, name: `${s.first_name} ${s.last_name}`.trim(), meta: sinceMeta(s.created_at, now) })),
    };
  };
  const [hoje, d7, d30] = await Promise.all([
    since(startOfTodaySP(now)),
    since(new Date(now.getTime() - 7 * DAY_MS).toISOString()),
    since(new Date(now.getTime() - 30 * DAY_MS).toISOString()),
  ]);
  const href = studentListHref({ sort: "created:desc" });
  return [
    { id: "hoje", label: "Hoje", emptyMessage: "Nenhum aluno cadastrado hoje.", href, ...hoje },
    { id: "7-dias", label: "7 dias", emptyMessage: "Nenhum aluno cadastrado nos últimos 7 dias.", href, ...d7 },
    { id: "30-dias", label: "30 dias", emptyMessage: "Nenhum aluno cadastrado nos últimos 30 dias.", href, ...d30 },
  ];
}

/** Acesso expirando nos próximos 7 dias (aba Ativos), dados reais. */
export async function getExpiringAccess(now = new Date()): Promise<{ items: StudentRef[]; count: number }> {
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("students_with_status")
    .select("id, first_name, last_name, access_expires_at", { count: "exact" })
    .in("effective_status", ["active", "blocked"])
    .gte("access_expires_at", now.toISOString())
    .lt("access_expires_at", new Date(now.getTime() + 7 * DAY_MS).toISOString())
    .order("access_expires_at", { ascending: true })
    .limit(6);
  return {
    count: count ?? 0,
    items: (data ?? []).map((s) => ({
      id: s.id!,
      name: `${s.first_name} ${s.last_name}`.trim(),
      meta: dueMeta(s.access_expires_at!, { future: "expira", past: "expirou" }, now),
    })),
  };
}
