import "server-only";
import { createClient } from "@/lib/db/server";
import { parseInactive, type InactiveStudent } from "./pause";

/** Início: sem treinar além do limite. Falha (ex.: migration ainda não aplicada) → null e o card some. */
export async function getInactiveStudents(): Promise<InactiveStudent[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_inactive_students");
  return error ? null : parseInactive(data);
}

/** Pausas dos alunos listados (RLS: só os que o chamador acessa). */
export async function getPauses(studentIds: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (!studentIds.length) return map;
  const supabase = await createClient();
  const { data } = await supabase.from("student_pauses").select("student_id, until").in("student_id", studentIds);
  for (const r of data ?? []) map.set(r.student_id, r.until);
  return map;
}
