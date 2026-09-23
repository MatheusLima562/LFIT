import "server-only";
import { createClient } from "@/lib/db/server";

export interface ClassRow {
  id: string;
  name: string;
  trainerId: string | null;
  trainerName: string | null;
  /** Alunos visíveis ao usuário (RLS: trainer só conta os seus). */
  students: number;
  canEdit: boolean;
}

export async function listClasses(userId: string, isOwner: boolean): Promise<ClassRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("classes")
    .select("id, name, trainer_id, trainer:profiles!classes_trainer_id_organization_id_fkey(full_name), class_students(count)")
    .order("name");
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    trainerId: c.trainer_id,
    trainerName: (c.trainer as { full_name: string } | null)?.full_name ?? null,
    students: (c.class_students as unknown as { count: number }[])[0]?.count ?? 0,
    canEdit: isOwner || c.trainer_id === userId,
  }));
}
