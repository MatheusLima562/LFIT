import "server-only";
import { createClient } from "@/lib/db/server";

export type ListKind = "methods" | "objectives";
export const LIST_TABLE = { methods: "training_methods", objectives: "training_objectives" } as const;

export interface ListRow {
  id: string;
  name: string;
  position: number;
  archived: boolean;
  /** Itens de treino que usam este valor (arquivar não os altera). */
  uses: number;
}

export async function getTrainingLists(): Promise<Record<ListKind, ListRow[]>> {
  const supabase = await createClient();
  const [m, o, uses] = await Promise.all([
    supabase.from("training_methods").select("id, name, position, archived_at").order("position").order("name"),
    supabase.from("training_objectives").select("id, name, position, archived_at").order("position").order("name"),
    supabase.from("plan_workout_items").select("method_id, objective_id").or("method_id.not.is.null,objective_id.not.is.null").limit(5000),
  ]);
  const count = new Map<string, number>();
  for (const u of uses.data ?? []) {
    for (const id of [u.method_id, u.objective_id]) if (id) count.set(id, (count.get(id) ?? 0) + 1);
  }
  const map = (rows: { id: string; name: string; position: number; archived_at: string | null }[] | null) =>
    (rows ?? []).map((r) => ({ id: r.id, name: r.name, position: r.position, archived: r.archived_at !== null, uses: count.get(r.id) ?? 0 }));
  return { methods: map(m.data), objectives: map(o.data) };
}
