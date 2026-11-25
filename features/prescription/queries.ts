import "server-only";
import { createClient } from "@/lib/db/server";
import { parseHistory, parseReview, type HistoryBatch, type LoadUnit, type QuickWorkout, type ReviewItem } from "./prescription";

export interface QuickSheet {
  planId: string;
  planName: string;
  loadStep: number;
  workouts: QuickWorkout[];
}

/**
 * Ficha rápida: plano ATIVO do aluno com divisões e exercícios (leitura pelo RLS da equipe). Sem plano ativo → null.
 * Nada de saúde aqui: só nome do exercício e prescrição.
 */
export async function getQuickSheet(studentId: string, organizationId: string): Promise<QuickSheet | null> {
  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("training_plans")
    .select("id, name")
    .eq("student_id", studentId)
    .eq("status", "active")
    .order("starts_on", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return null;

  const [{ data: workouts }, { data: org }] = await Promise.all([
    supabase
      .from("plan_workouts")
      .select("id, label, name, position, plan_workout_items(id, position, sets, quantity_min, quantity_max, quantity_unit, load_value, load_unit, load_text, exercises(name), plan_item_sets(id))")
      .eq("plan_id", plan.id)
      .order("position"),
    supabase.from("organizations").select("load_step").eq("id", organizationId).maybeSingle(),
  ]);

  type Row = {
    id: string; label: string; name: string | null; position: number;
    plan_workout_items: {
      id: string; position: number; sets: number | null; quantity_min: number | null; quantity_max: number | null;
      quantity_unit: string; load_value: number | null; load_unit: LoadUnit | null; load_text: string | null;
      exercises: { name: string } | null; plan_item_sets: { id: string }[];
    }[];
  };
  return {
    planId: plan.id,
    planName: plan.name,
    loadStep: Number(org?.load_step ?? 2.5) || 2.5,
    workouts: ((workouts ?? []) as unknown as Row[]).map((w) => ({
      id: w.id,
      label: w.label,
      name: w.name,
      items: [...w.plan_workout_items].sort((a, b) => a.position - b.position).map((i) => ({
        id: i.id,
        exerciseName: i.exercises?.name ?? "—",
        sets: i.sets,
        quantityMin: i.quantity_min,
        quantityMax: i.quantity_max,
        quantityUnit: i.quantity_unit,
        loadValue: i.load_value === null ? null : Number(i.load_value),
        loadUnit: i.load_unit,
        loadText: i.load_text,
        detailed: (i.plan_item_sets?.length ?? 0) > 0,
      })),
    })),
  };
}

/** Itens com séries registradas na sessão concluída mais recente (ou na sessão pedida). Falha → lista vazia. */
export async function getPrescriptionReview(studentId: string, sessionId?: string): Promise<ReviewItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_prescription_review", { p_student_id: studentId, ...(sessionId ? { p_session_id: sessionId } : {}) });
  return error ? [] : parseReview(data);
}

export async function listPrescriptionChanges(studentId: string): Promise<HistoryBatch[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_prescription_changes", { p_student_id: studentId, p_limit: 30 });
  return error ? [] : parseHistory(data);
}
