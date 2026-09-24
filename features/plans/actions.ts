"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { searchKey } from "@/lib/text";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { MUSCLE_GROUPS, type MuscleGroup } from "@/features/exercises/constants";
import { planPayloadSchema } from "./schemas";

export type PlanActionResult = { ok: true; id: string; message: string } | { ok: false; error: string };

async function isStaff() {
  const session = await getSession();
  return Boolean(session && session.role !== "student");
}

function revalidatePlan(studentId: string | null, planId?: string) {
  if (studentId) {
    revalidatePath(`/alunos/${studentId}/treinos`);
    revalidatePath("/alunos");
  } else revalidatePath("/treinos/modelos");
  if (planId) revalidatePath(`/treinos/${planId}/editar`);
}

/** Salva o plano inteiro (RPC save_training_plan: substitui a estrutura numa transação). */
export async function savePlan(input: unknown): Promise<PlanActionResult> {
  const parsed = planPayloadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? messages.dbErrors.INVALID_INPUT };
  if (!(await isStaff())) return { ok: false, error: messages.dbErrors.FORBIDDEN };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_training_plan", { p_plan: parsed.data });
  if (error || !data) return { ok: false, error: dbErrorMessage(error) };
  revalidatePlan(parsed.data.student_id, data);
  return { ok: true, id: data, message: parsed.data.student_id ? messages.plans.actions.saved : messages.plans.actions.templateSaved };
}

export async function activatePlan(planId: string, studentId: string): Promise<PlanActionResult> {
  if (!z.uuid().safeParse(planId).success || !z.uuid().safeParse(studentId).success) return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  if (!(await isStaff())) return { ok: false, error: messages.dbErrors.FORBIDDEN };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("activate_plan", { p_plan_id: planId });
  if (error) return { ok: false, error: dbErrorMessage(error) };
  revalidatePlan(studentId, planId);
  // Início futuro → agendado (ativado pelo job diário na data).
  return { ok: true, id: planId, message: data === "scheduled" ? messages.plans.actions.scheduled : messages.plans.actions.activated };
}

export interface PickerExercise {
  id: string;
  name: string;
  muscleGroups: MuscleGroup[];
  equipment: string | null;
  isGlobal: boolean;
}

/** Busca do seletor de exercícios do montador (mesma visão da biblioteca). */
export async function searchExercises(q: string, grupo: string | null): Promise<PickerExercise[]> {
  if (!(await isStaff())) return [];
  const supabase = await createClient();
  let query = supabase
    .from("exercise_library")
    .select("id, name, muscle_groups, equipment, is_global")
    .is("archived_at", null)
    .eq("customized", false);
  const term = searchKey(q.slice(0, 100)).replace(/[%_*,()\\"']/g, " ").replace(/\s+/g, " ").trim();
  if (term) query = query.ilike("search_text", `%${term}%`);
  if (grupo && (MUSCLE_GROUPS as readonly string[]).includes(grupo)) query = query.contains("muscle_groups", [grupo]);
  const { data } = await query.order("name").limit(60);
  return (data ?? []).map((e) => ({
    id: e.id!,
    name: e.name!,
    muscleGroups: (e.muscle_groups ?? []) as MuscleGroup[],
    equipment: e.equipment,
    isGlobal: Boolean(e.is_global),
  }));
}

// ---------------------------------------------------------------------------
// Gestão (lista do aluno, modelos)
// ---------------------------------------------------------------------------

const uuid = z.uuid();

async function planOwner(planId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("training_plans").select("student_id").eq("id", planId).maybeSingle();
  return data?.student_id ?? null;
}

export async function duplicatePlan(planId: string): Promise<PlanActionResult> {
  if (!uuid.safeParse(planId).success) return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  if (!(await isStaff())) return { ok: false, error: messages.dbErrors.FORBIDDEN };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_plan", { p_plan_id: planId });
  if (error || !data) return { ok: false, error: dbErrorMessage(error) };
  revalidatePlan(await planOwner(planId));
  return { ok: true, id: data, message: messages.plans.manage.duplicated };
}

export async function savePlanAsTemplate(planId: string, name: string): Promise<PlanActionResult> {
  const parsedName = z.string().trim().min(2, messages.validation.required).max(120).safeParse(name);
  if (!uuid.safeParse(planId).success) return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  if (!parsedName.success) return { ok: false, error: parsedName.error.issues[0].message };
  if (!(await isStaff())) return { ok: false, error: messages.dbErrors.FORBIDDEN };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_plan_as_template", { p_plan_id: planId, p_name: parsedName.data });
  if (error || !data) return { ok: false, error: dbErrorMessage(error) };
  revalidatePlan(null);
  return { ok: true, id: data, message: messages.plans.manage.templateCreated };
}

export async function archivePlan(planId: string): Promise<PlanActionResult> {
  if (!uuid.safeParse(planId).success) return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  if (!(await isStaff())) return { ok: false, error: messages.dbErrors.FORBIDDEN };
  const studentId = await planOwner(planId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_plan", { p_plan_id: planId });
  if (error) return { ok: false, error: dbErrorMessage(error) };
  revalidatePlan(studentId, planId);
  revalidatePath("/treinos");
  return { ok: true, id: planId, message: messages.plans.manage.archived };
}

const applySchema = z.object({
  templateId: uuid,
  studentId: uuid,
  startsOn: z.iso.date().nullable(),
  endsOn: z.iso.date().nullable(),
});

/** Aplica um modelo a um aluno: novo rascunho (RPC apply_template_to_student). */
export async function applyTemplate(input: unknown): Promise<PlanActionResult> {
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  const { templateId, studentId, startsOn, endsOn } = parsed.data;
  if (startsOn && endsOn && endsOn < startsOn) return { ok: false, error: messages.plans.validation.endBeforeStart };
  if (!(await isStaff())) return { ok: false, error: messages.dbErrors.FORBIDDEN };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_template_to_student", {
    p_template_id: templateId,
    p_student_id: studentId,
    // null = sem período (os tipos gerados não marcam argumentos SQL como anuláveis)
    p_starts_on: startsOn ?? (null as unknown as string),
    p_ends_on: endsOn ?? (null as unknown as string),
  });
  if (error || !data) return { ok: false, error: dbErrorMessage(error) };
  revalidatePlan(studentId);
  return { ok: true, id: data, message: messages.plans.manage.applied };
}
