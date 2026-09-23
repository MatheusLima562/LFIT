import "server-only";
import { createClient } from "@/lib/db/server";

export interface GroupRow {
  id: string;
  name: string;
  color: string;
  /** Alunos do grupo visíveis ao usuário (RLS de dados de saúde). */
  students: number;
}

export async function listGroups(): Promise<GroupRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("special_groups").select("id, name, color, student_groups(count)").order("name");
  return (data ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    color: g.color,
    students: (g.student_groups as unknown as { count: number }[])[0]?.count ?? 0,
  }));
}
