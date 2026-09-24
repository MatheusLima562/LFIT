import "server-only";
import { createClient } from "@/lib/db/server";
import { exerciseMediaUrl } from "@/lib/media";
import { searchKey } from "@/lib/text";
import type { ContraindicationLevel, MuscleGroup } from "./constants";
import { EXERCISE_PAGE_SIZE, type ExerciseListParams } from "./search-params";

export interface ExerciseRow {
  id: string;
  name: string;
  muscleGroups: MuscleGroup[];
  equipment: string | null;
  isGlobal: boolean;
  archived: boolean;
  customizedFrom: string | null;
  /** Tem vídeo enviado ou link. */
  hasVideo: boolean;
  rules: { avoid: number; caution: number };
}

type ListRow = {
  id: string;
  name: string;
  muscle_groups: string[];
  equipment: string | null;
  is_global: boolean;
  archived_at: string | null;
  source_exercise_id: string | null;
  has_video: boolean;
  video_url: string | null;
  rules: { level: ContraindicationLevel }[];
};

/** Remove caracteres com significado na sintaxe de filtros do PostgREST. */
function sanitizeTerm(term: string) {
  return searchKey(term).replace(/[%_*,()\\"']/g, " ").replace(/\s+/g, " ").trim();
}

/** Lista paginada no servidor (RLS: biblioteca global + exercícios da organização). */
export async function listExercises(params: ExerciseListParams) {
  const supabase = await createClient();
  let select = "id, name, muscle_groups, equipment, is_global, archived_at, source_exercise_id, has_video, video_url, rules:exercise_contraindications(level)";
  if (params.condicao) select += ", cond:exercise_contraindications!inner(condition_id)";

  let query = supabase.from("exercise_library").select(select, { count: "exact" });

  if (params.origem === "archived") query = query.not("archived_at", "is", null);
  else {
    query = query.is("archived_at", null).eq("customized", false);
    if (params.origem === "global") query = query.eq("is_global", true);
    if (params.origem === "own") query = query.eq("is_global", false);
  }
  if (params.condicao) query = query.eq("cond.condition_id", params.condicao);
  if (params.grupo) query = query.contains("muscle_groups", [params.grupo]);
  if (params.equip) query = query.eq("equipment", params.equip);
  if (params.q) {
    const term = sanitizeTerm(params.q);
    if (term) query = query.ilike("search_text", `%${term}%`);
  }

  const from = (params.page - 1) * EXERCISE_PAGE_SIZE;
  const { data, count, error } = await query.order("name").order("id").range(from, from + EXERCISE_PAGE_SIZE - 1);
  if (error) throw new Error(`Falha ao listar exercícios: ${error.message}`);

  const rows: ExerciseRow[] = ((data ?? []) as unknown as ListRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    muscleGroups: r.muscle_groups as MuscleGroup[],
    equipment: r.equipment,
    isGlobal: r.is_global,
    archived: r.archived_at !== null,
    customizedFrom: r.source_exercise_id,
    hasVideo: r.has_video || r.video_url !== null,
    rules: {
      avoid: r.rules.filter((x) => x.level === "avoid").length,
      caution: r.rules.filter((x) => x.level === "caution").length,
    },
  }));
  return { rows, total: count ?? 0 };
}

export interface ConditionOption {
  id: string;
  name: string;
  isGlobal: boolean;
}

export async function listConditionOptions(): Promise<ConditionOption[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("health_conditions").select("id, name, organization_id").is("archived_at", null).order("name");
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, isGlobal: c.organization_id === null }));
}

export async function getExerciseFilterOptions() {
  const supabase = await createClient();
  const [equipment, conditions] = await Promise.all([
    supabase.from("exercises").select("equipment").is("archived_at", null).not("equipment", "is", null).limit(2000),
    listConditionOptions(),
  ]);
  const unique = [...new Set((equipment.data ?? []).map((e) => e.equipment as string))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return { equipment: unique, conditions };
}

export interface ExerciseRule {
  conditionId: string;
  conditionName: string;
  level: ContraindicationLevel;
  note: string | null;
  /** Regra da biblioteca global (somente leitura) ou da equipe. */
  isGlobal: boolean;
}

export interface ExerciseDetail {
  id: string;
  name: string;
  muscleGroups: MuscleGroup[];
  equipment: string | null;
  instructions: string | null;
  videoUrl: string | null;
  isGlobal: boolean;
  archived: boolean;
  customizedFrom: string | null;
  /** Vídeo enviado (URL assinada de 7 dias, reaproveitada entre acessos). Tem prioridade sobre o link. */
  video: { url: string; posterUrl: string | null } | null;
  /** Bytes do vídeo atual (para descontar na checagem de cota ao trocar). */
  mediaBytes: number;
  /** Dados do exercício editáveis pelo usuário (próprio + owner ou autor). */
  canEdit: boolean;
  rules: ExerciseRule[];
}

export async function getExerciseDetail(id: string, session: { userId: string; role: string }): Promise<ExerciseDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("exercises")
    .select(
      "id, organization_id, name, muscle_groups, equipment, instructions, video_url, video_path, poster_path, media_bytes, archived_at, created_by, source_exercise_id, " +
        "exercise_contraindications(organization_id, level, note, condition:health_conditions(id, name))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    organization_id: string | null;
    name: string;
    muscle_groups: string[];
    equipment: string | null;
    instructions: string | null;
    video_url: string | null;
    video_path: string | null;
    poster_path: string | null;
    media_bytes: number;
    archived_at: string | null;
    created_by: string | null;
    source_exercise_id: string | null;
    exercise_contraindications: { organization_id: string | null; level: ContraindicationLevel; note: string | null; condition: { id: string; name: string } | null }[];
  };
  const isGlobal = row.organization_id === null;
  // Caminhos vindos de uma linha que o RLS já liberou ao usuário: pode assinar.
  const [videoUrl, posterUrl] = await Promise.all([exerciseMediaUrl(row.video_path), exerciseMediaUrl(row.poster_path)]);
  return {
    id: row.id,
    name: row.name,
    muscleGroups: row.muscle_groups as MuscleGroup[],
    equipment: row.equipment,
    instructions: row.instructions,
    videoUrl: row.video_url,
    isGlobal,
    archived: row.archived_at !== null,
    customizedFrom: row.source_exercise_id,
    video: videoUrl ? { url: videoUrl, posterUrl } : null,
    mediaBytes: row.media_bytes,
    canEdit: !isGlobal && (session.role === "owner" || row.created_by === session.userId),
    rules: row.exercise_contraindications
      .flatMap((r) =>
        r.condition
          ? [{ conditionId: r.condition.id, conditionName: r.condition.name, level: r.level, note: r.note, isGlobal: r.organization_id === null }]
          : [],
      )
      .sort((a, b) => Number(b.isGlobal) - Number(a.isGlobal) || a.conditionName.localeCompare(b.conditionName, "pt-BR")),
  };
}

export interface VideoUsage {
  usedBytes: number;
  quotaBytes: number;
}

export async function getVideoUsage(): Promise<VideoUsage> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("organization_video_usage").single();
  return { usedBytes: Number(data?.used_bytes ?? 0), quotaBytes: Number(data?.quota_bytes ?? 0) };
}
