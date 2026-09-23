import "server-only";
import { createClient } from "@/lib/db/server";

export interface ConditionRow {
  id: string;
  name: string;
  description: string | null;
  isGlobal: boolean;
  archived: boolean;
  /** Exercícios (visíveis à equipe) com contraindicação para a condição. */
  exercises: number;
  /** Grupos especiais da equipe ligados à condição. */
  groups: number;
}

export async function listConditions(): Promise<ConditionRow[]> {
  const supabase = await createClient();
  const [conditions, rules, links] = await Promise.all([
    supabase.from("health_conditions").select("id, name, description, organization_id, archived_at").order("name"),
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

  return (conditions.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    isGlobal: c.organization_id === null,
    archived: c.archived_at !== null,
    exercises: exercisesBy.get(c.id)?.size ?? 0,
    groups: groupsBy.get(c.id) ?? 0,
  }));
}
