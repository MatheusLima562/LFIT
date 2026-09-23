import "server-only";
import { createClient } from "@/lib/db/server";
import type { Database } from "@/lib/db/types";
import { searchKey } from "@/lib/text";
import { PAGE_SIZE, type StudentListParams } from "./search-params";

export type EffectiveStatus = Database["public"]["Enums"]["effective_status"];

export interface StudentRow {
  id: string;
  fullName: string;
  firstName: string;
  email: string;
  whatsapp: string | null;
  birthDate: string | null;
  sex: "M" | "F" | null;
  enrollmentNumber: number;
  status: EffectiveStatus;
  accessExpiresAt: string | null;
  hasAccount: boolean;
  trainerName: string | null;
  groups: { name: string; color: string }[];
}

const STATUS_FILTER: Record<StudentListParams["status"], EffectiveStatus[]> = {
  active: ["active", "blocked"],
  inactive: ["inactive"],
  expired: ["expired"],
};

const BASE_COLUMNS =
  "id, full_name, first_name, email, whatsapp_e164, birth_date, sex, enrollment_number, effective_status, access_expires_at, user_id, " +
  "trainer:profiles!students_trainer_id_organization_id_fkey(full_name), student_groups(special_groups(name, color))";

/** Remove caracteres com significado na sintaxe de filtros do PostgREST. */
function sanitizeTerm(term: string) {
  return searchKey(term).replace(/[%_*,()\\"']/g, " ").replace(/\s+/g, " ").trim();
}

type Row = {
  id: string;
  full_name: string;
  first_name: string;
  email: string;
  whatsapp_e164: string | null;
  birth_date: string | null;
  sex: "M" | "F" | null;
  enrollment_number: number;
  effective_status: EffectiveStatus;
  access_expires_at: string | null;
  user_id: string | null;
  trainer: { full_name: string } | null;
  student_groups: { special_groups: { name: string; color: string } | null }[];
};

function toStudentRow(r: Row): StudentRow {
  return {
    id: r.id,
    fullName: r.full_name,
    firstName: r.first_name,
    email: r.email,
    whatsapp: r.whatsapp_e164,
    birthDate: r.birth_date,
    sex: r.sex,
    enrollmentNumber: r.enrollment_number,
    status: r.effective_status,
    accessExpiresAt: r.access_expires_at,
    hasAccount: r.user_id !== null,
    trainerName: r.trainer?.full_name ?? null,
    groups: r.student_groups.flatMap((g) => (g.special_groups ? [g.special_groups] : [])),
  };
}

/**
 * Lista paginada no servidor. O RLS limita o escopo (owner: org; trainer: seus alunos).
 * `limit` permite a exportação reaproveitar exatamente os mesmos filtros.
 */
export async function listStudents(params: StudentListParams, options: { limit?: number } = {}) {
  const supabase = await createClient();

  let select = BASE_COLUMNS;
  if (params.turma) select += ", turma:class_students!inner(class_id)";
  if (params.grupo) select += ", grupo:student_groups!inner(group_id)";

  let query = supabase
    .from("students_with_status")
    .select(select, { count: "exact" })
    .in("effective_status", STATUS_FILTER[params.status]);

  if (params.turma) query = query.eq("turma.class_id", params.turma);
  if (params.grupo) query = query.eq("grupo.group_id", params.grupo);

  if (params.q) {
    const term = sanitizeTerm(params.q);
    const digits = params.q.replace(/\D/g, "");
    if (term && /^#?\d+$/.test(params.q.trim())) {
      query = query.or(`search_text.ilike.*${term}*,enrollment_number.eq.${Number(digits)}`);
    } else if (term) {
      query = query.ilike("search_text", `%${term}%`);
    }
  }

  const [field, dir] = params.sort.split(":") as [string, "asc" | "desc"];
  const ascending = dir === "asc";
  if (field === "name") {
    query = query.order("first_name", { ascending }).order("last_name", { ascending });
  } else if (field === "created") {
    query = query.order("created_at", { ascending: false });
  } else {
    query = query.order("access_expires_at", { ascending, nullsFirst: false }).order("first_name");
  }
  query = query.order("id"); // desempate estável para paginação

  const limit = options.limit ?? PAGE_SIZE;
  const from = options.limit ? 0 : (params.page - 1) * PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + limit - 1);
  if (error) throw new Error(`Falha ao listar alunos: ${error.message}`);

  return {
    rows: ((data ?? []) as unknown as Row[]).map(toStudentRow),
    total: count ?? 0,
  };
}

export async function getStudentTabCounts() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("student_tab_counts").single();
  if (error || !data) return { active: 0, inactive: 0, expired: 0 };
  return { active: Number(data.active), inactive: Number(data.inactive), expired: Number(data.expired) };
}

export async function getStudentFilterOptions() {
  const supabase = await createClient();
  const [classes, groups] = await Promise.all([
    supabase.from("classes").select("id, name").order("name"),
    supabase.from("special_groups").select("id, name, color").order("name"),
  ]);
  return { classes: classes.data ?? [], groups: groups.data ?? [] };
}
