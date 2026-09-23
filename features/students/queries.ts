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
  photoUrl: string | null;
}

const STATUS_FILTER: Record<StudentListParams["status"], EffectiveStatus[]> = {
  active: ["active", "blocked"],
  inactive: ["inactive"],
  expired: ["expired"],
};

const BASE_COLUMNS =
  "id, full_name, first_name, email, whatsapp_e164, birth_date, sex, enrollment_number, effective_status, access_expires_at, user_id, photo_path, " +
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
  photo_path: string | null;
  trainer: { full_name: string } | null;
  student_groups: { special_groups: { name: string; color: string } | null }[];
};

function toStudentRow(r: Row, photoUrls: Map<string, string>): StudentRow {
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
    photoUrl: r.photo_path ? (photoUrls.get(r.photo_path) ?? null) : null,
  };
}

const PHOTO_BUCKET = "student-photos";
const PHOTO_URL_TTL = 60 * 60;

/** URLs assinadas (bucket privado, RLS do Storage) em lote. */
async function signPhotoUrls(supabase: Awaited<ReturnType<typeof createClient>>, paths: string[]) {
  const map = new Map<string, string>();
  if (paths.length === 0) return map;
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, PHOTO_URL_TTL);
  for (const item of data ?? []) if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
  return map;
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

  const raw = (data ?? []) as unknown as Row[];
  const photoUrls = await signPhotoUrls(supabase, raw.flatMap((r) => (r.photo_path ? [r.photo_path] : [])));
  return {
    rows: raw.map((r) => toStudentRow(r, photoUrls)),
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

export interface StudentForEdit {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  birthDate: string | null;
  sex: "M" | "F" | null;
  whatsapp: string | null;
  trainerId: string | null;
  groupIds: string[];
  healthConsentAt: string | null;
  accessExpiresAt: string | null;
  trainingLocation: string | null;
  notes: string | null;
  blockIfOverdue: boolean;
  photoPath: string | null;
  photoUrl: string | null;
  hasAccount: boolean;
}

/** Dados para o modal de edição (RLS: só alunos acessíveis ao usuário). */
export async function getStudentForEdit(id: string): Promise<StudentForEdit | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("students")
    .select(
      "id, first_name, last_name, email, birth_date, sex, whatsapp_e164, trainer_id, health_data_consent_at, access_expires_at, training_location, notes, block_if_overdue, photo_path, user_id, student_groups(group_id)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  const photoUrls = await signPhotoUrls(supabase, data.photo_path ? [data.photo_path] : []);
  return {
    id: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    email: data.email,
    birthDate: data.birth_date,
    sex: data.sex,
    whatsapp: data.whatsapp_e164,
    trainerId: data.trainer_id,
    groupIds: data.student_groups.map((g) => g.group_id),
    healthConsentAt: data.health_data_consent_at,
    accessExpiresAt: data.access_expires_at,
    trainingLocation: data.training_location,
    notes: data.notes,
    blockIfOverdue: data.block_if_overdue,
    photoPath: data.photo_path,
    photoUrl: data.photo_path ? (photoUrls.get(data.photo_path) ?? null) : null,
    hasAccount: data.user_id !== null,
  };
}

export interface StudentFormOptions {
  trainers: { id: string; name: string }[];
  groups: { id: string; name: string; color: string }[];
  templates: { id: string; title: string }[];
  overdueGraceDays: number;
}

export async function getStudentFormOptions(): Promise<StudentFormOptions> {
  const supabase = await createClient();
  const [trainers, groups, templates, org] = await Promise.all([
    supabase.from("profiles").select("id, full_name").in("role", ["owner", "trainer"]).order("full_name"),
    supabase.from("special_groups").select("id, name, color").order("name"),
    supabase.from("anamnesis_templates").select("id, title").order("title"),
    supabase.from("organizations").select("overdue_grace_days").maybeSingle(),
  ]);
  return {
    trainers: (trainers.data ?? []).map((t) => ({ id: t.id, name: t.full_name })),
    groups: groups.data ?? [],
    templates: templates.data ?? [],
    overdueGraceDays: org.data?.overdue_grace_days ?? 5,
  };
}
