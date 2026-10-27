import "server-only";
import { createClient } from "@/lib/db/server";
import { guideKeyFor } from "@/features/knowledge/guide-for";
import { orderByRegion } from "./regions";

export interface ConditionRow {
  id: string;
  name: string;
  description: string | null;
  /** Chave estável do catálogo global (liga ao Guia); nula nas condições da equipe. */
  key: string | null;
  isGlobal: boolean;
  archived: boolean;
  /** Região (condição pai). */
  parentId: string | null;
  parentName: string | null;
  /** Guia desta condição (ou da região), se houver. */
  guideKey: string | null;
  searchTerms: string[];
  /** Exercícios (visíveis à equipe) com contraindicação para a condição. */
  exercises: number;
  /** Grupos especiais da equipe ligados à condição. */
  groups: number;
}

export async function listConditions(): Promise<ConditionRow[]> {
  const supabase = await createClient();
  const [conditions, rules, links] = await Promise.all([
    supabase
      .from("health_conditions")
      .select("id, key, name, description, organization_id, archived_at, parent_id, search_terms")
      .order("name"),
    supabase.from("exercise_contraindications").select("condition_id, exercise_id, exercise:exercises!inner(archived_at)").is("exercise.archived_at", null),
    supabase.from("special_group_conditions").select("condition_id"),
  ]);
  const exercisesBy = new Map<string, Set<string>>();
  for (const r of rules.data ?? []) {
    if (!exercisesBy.has(r.condition_id)) exercisesBy.set(r.condition_id, new Set());
    exercisesBy.get(r.condition_id)!.add(r.exercise_id);
  }
  const groupsBy = new Map<string, number>();
  for (const l of links.data ?? []) groupsBy.set(l.condition_id, (groupsBy.get(l.condition_id) ?? 0) + 1);

  const rows = conditions.data ?? [];
  const byId = new Map(rows.map((c) => [c.id, c]));
  return orderByRegion(
    rows.map((c) => ({
      id: c.id,
      key: c.key,
      name: c.name,
      description: c.description,
      isGlobal: c.organization_id === null,
      archived: c.archived_at !== null,
      parentId: c.parent_id,
      parentName: c.parent_id ? (byId.get(c.parent_id)?.name ?? null) : null,
      guideKey: guideKeyFor({ key: c.key, parentKey: c.parent_id ? (byId.get(c.parent_id)?.key ?? null) : null }),
      searchTerms: c.search_terms,
      exercises: exercisesBy.get(c.id)?.size ?? 0,
      groups: groupsBy.get(c.id) ?? 0,
    })),
  );
}
