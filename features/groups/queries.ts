import "server-only";
import { createClient } from "@/lib/db/server";

export interface GroupRow {
  id: string;
  name: string;
  color: string;
  /** Alunos do grupo visíveis ao usuário (RLS de dados de saúde). */
  students: number;
  /** Condições de saúde ligadas (ativam os alertas do montador). */
  conditions: { id: string; name: string }[];
}

export async function listGroups(): Promise<GroupRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("special_groups").select("id, name, color, student_groups(count), special_group_conditions(condition:health_conditions(id, name, archived_at))").order("name");
  return (data ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    color: g.color,
    students: (g.student_groups as unknown as { count: number }[])[0]?.count ?? 0,
    conditions: (g.special_group_conditions as unknown as { condition: { id: string; name: string; archived_at: string | null } | null }[])
      .flatMap((l) => (l.condition && !l.condition.archived_at ? [{ id: l.condition.id, name: l.condition.name }] : []))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
  }));
}
