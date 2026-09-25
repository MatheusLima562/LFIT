import "server-only";
import { createClient } from "@/lib/db/server";
import { getGuide, guideKeyFor } from "./guide-for";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import type { ClearanceKind, RedFlagCheck, RedFlagKey } from "./red-flags";
import type { Guide } from "./types";

export interface StudentCondition {
  id: string;
  name: string;
  guideKey: string | null;
}

/** Condições do aluno (grupos especiais → condições) e os Guias correspondentes. */
export interface StudentHealthGuides {
  conditions: StudentCondition[];
  guides: Record<string, Guide>;
  /** Última triagem de sinais de alerta (ou null se nunca registrada). */
  redFlag: RedFlagCheck | null;
}

/** Última triagem (RLS: só com can_view_student_health; nos demais níveis volta null). */
export async function getLatestRedFlagCheck(supabase: SupabaseClient<Database>, studentId: string): Promise<RedFlagCheck | null> {
  const { data } = await supabase
    .from("student_red_flag_checks")
    .select("id, items, note, recorded_at, clearance_kind, clearance_name, clearance_on, clearance_note, clearance_recorded_at")
    .eq("student_id", studentId)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    items: data.items as RedFlagKey[],
    note: data.note,
    recordedAt: data.recorded_at,
    clearance:
      data.clearance_recorded_at && data.clearance_kind && data.clearance_on
        ? { kind: data.clearance_kind as ClearanceKind, name: data.clearance_name, on: data.clearance_on, note: data.clearance_note }
        : null,
  };
}

/**
 * Só no nível completo de saúde (`can_view_student_health`): nos níveis restrito e oculto devolve null e nada
 * sobre as condições do aluno chega ao cliente.
 */
export async function getStudentHealthGuides(studentId: string): Promise<StudentHealthGuides | null> {
  const supabase = await createClient();
  const { data: canView } = await supabase.rpc("can_view_student_health", { p_student_id: studentId });
  if (canView !== true) return null;

  const [{ data: groups }, redFlag] = await Promise.all([
    supabase.from("student_groups").select("group_id").eq("student_id", studentId),
    getLatestRedFlagCheck(supabase, studentId),
  ]);
  const groupIds = (groups ?? []).map((g) => g.group_id);
  if (!groupIds.length) return { conditions: [], guides: {}, redFlag };

  const { data: links } = await supabase
    .from("special_group_conditions")
    .select("condition:health_conditions(id, key, name, archived_at, parent_id)")
    .in("group_id", groupIds);
  type Cond = { id: string; key: string | null; name: string; archived_at: string | null; parent_id: string | null };
  const conds = new Map<string, Cond>();
  for (const l of (links ?? []) as unknown as { condition: Cond | null }[]) {
    if (l.condition && !l.condition.archived_at) conds.set(l.condition.id, l.condition);
  }
  const parentIds = [...new Set([...conds.values()].map((c) => c.parent_id).filter((id): id is string => !!id))];
  const { data: parents } = parentIds.length
    ? await supabase.from("health_conditions").select("id, key").in("id", parentIds)
    : { data: [] as { id: string; key: string | null }[] };
  const parentKey = new Map((parents ?? []).map((p) => [p.id, p.key]));

  const conditions = [...conds.values()]
    .map((c) => ({ id: c.id, name: c.name, guideKey: guideKeyFor({ key: c.key, parentKey: c.parent_id ? (parentKey.get(c.parent_id) ?? null) : null }) }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const guides: Record<string, Guide> = {};
  for (const c of conditions) {
    const g = c.guideKey ? getGuide(c.guideKey) : null;
    if (g) guides[g.key] = g;
  }
  return { conditions, guides, redFlag };
}
