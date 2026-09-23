import "server-only";
import { createClient } from "@/lib/db/server";
import type { ContraindicationLevel } from "@/features/exercises/constants";
import type { SavedPlan } from "./builder";
import type { LoadUnit, PlanLevel, SetType } from "./schemas";

export type PlanStatus = "draft" | "active" | "archived";

export interface PlanForBuilder {
  plan: SavedPlan;
  status: PlanStatus;
  student: { id: string; name: string } | null;
  /** Modelo: owner ou autor. Plano de aluno: quem acessa o aluno (RLS). Arquivado: ninguém. */
  canEdit: boolean;
  /** Outro plano ativo do mesmo aluno (será arquivado ao ativar este). */
  otherActive: { id: string; name: string } | null;
}

type ItemRow = {
  position: number;
  group_key: string | null;
  sets: number | null;
  reps: string | null;
  load_value: number | null;
  load_unit: LoadUnit | null;
  load_text: string | null;
  rest_seconds: number | null;
  tempo: string | null;
  rpe_target: number | null;
  notes: string | null;
  exercise: { id: string; name: string } | null;
  plan_item_sets: { position: number; set_type: SetType; reps: string | null; load_value: number | null; load_unit: LoadUnit | null; load_text: string | null; rest_seconds: number | null }[];
};

type PlanRow = {
  id: string;
  student_id: string | null;
  name: string;
  goal: string | null;
  level: PlanLevel | null;
  starts_on: string | null;
  ends_on: string | null;
  notes: string | null;
  status: PlanStatus;
  created_by: string | null;
  student: { id: string; first_name: string; last_name: string } | null;
  plan_workouts: { label: string; name: string | null; notes: string | null; position: number; plan_workout_items: ItemRow[] }[];
};

const PLAN_SELECT =
  "id, student_id, name, goal, level, starts_on, ends_on, notes, status, created_by, " +
  "student:students!training_plans_student_id_organization_id_fkey(id, first_name, last_name), " +
  "plan_workouts(label, name, notes, position, plan_workout_items(position, group_key, sets, reps, load_value, load_unit, load_text, rest_seconds, tempo, rpe_target, notes, " +
  "exercise:exercises(id, name), plan_item_sets(position, set_type, reps, load_value, load_unit, load_text, rest_seconds)))";

const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;

export function toSavedPlan(row: PlanRow): SavedPlan {
  return {
    id: row.id,
    studentId: row.student_id,
    name: row.name,
    goal: row.goal,
    level: row.level,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    notes: row.notes,
    workouts: [...row.plan_workouts].sort(byPosition).map((w) => ({
      label: w.label,
      name: w.name,
      notes: w.notes,
      items: [...w.plan_workout_items].sort(byPosition).map((it) => ({
        exerciseId: it.exercise?.id ?? "",
        exerciseName: it.exercise?.name ?? "—",
        groupKey: it.group_key,
        sets: it.sets,
        reps: it.reps,
        loadValue: it.load_value,
        loadUnit: it.load_unit,
        loadText: it.load_text,
        restSeconds: it.rest_seconds,
        tempo: it.tempo,
        rpeTarget: it.rpe_target,
        notes: it.notes,
        setsDetail: [...it.plan_item_sets].sort(byPosition).map((s) => ({
          setType: s.set_type,
          reps: s.reps,
          loadValue: s.load_value,
          loadUnit: s.load_unit,
          loadText: s.load_text,
          restSeconds: s.rest_seconds,
        })),
      })),
    })),
  };
}

/** Plano completo (RLS: modelo = staff da org; plano de aluno = quem acessa o aluno). */
export async function getPlan(planId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("training_plans").select(PLAN_SELECT).eq("id", planId).maybeSingle();
  if (error) throw new Error(`Falha ao carregar treino: ${error.message}`);
  return (data as unknown as PlanRow | null) ?? null;
}

export async function getPlanForBuilder(planId: string, session: { userId: string; role: string }): Promise<PlanForBuilder | null> {
  const row = await getPlan(planId);
  if (!row) return null;
  const isTemplate = row.student_id === null;
  const canEdit = row.status !== "archived" && (!isTemplate || session.role === "owner" || row.created_by === session.userId);
  return {
    plan: toSavedPlan(row),
    status: row.status,
    student: row.student ? { id: row.student.id, name: `${row.student.first_name} ${row.student.last_name}` } : null,
    canEdit,
    otherActive: row.student_id ? await getActivePlan(row.student_id, row.id) : null,
  };
}

export async function getActivePlan(studentId: string, exceptId?: string) {
  const supabase = await createClient();
  let q = supabase.from("training_plans").select("id, name").eq("student_id", studentId).eq("status", "active");
  if (exceptId) q = q.neq("id", exceptId);
  const { data } = await q.maybeSingle();
  return data ?? null;
}

/** Aluno acessível ao usuário (RLS), para o cabeçalho do montador. */
export async function getStudentName(studentId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("students").select("id, first_name, last_name").eq("id", studentId).is("deleted_at", null).maybeSingle();
  return data ? { id: data.id, name: `${data.first_name} ${data.last_name}` } : null;
}

export interface StudentRule {
  exerciseId: string;
  level: ContraindicationLevel;
  note: string | null;
  conditionName: string;
  groupName: string;
}

/**
 * Regras de contraindicação que incidem no aluno. `hidden` = o usuário não pode
 * ver os dados de saúde (consentimento do titular pendente): nada é revelado.
 */
export async function getStudentRules(studentId: string): Promise<{ hidden: boolean; rules: StudentRule[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("student_contraindication_rules", { p_student_id: studentId });
  if (error || !data) return { hidden: false, rules: [] };
  if (data.some((r) => r.hidden)) return { hidden: true, rules: [] };
  return {
    hidden: false,
    rules: data.map((r) => ({
      exerciseId: r.exercise_id,
      level: r.level,
      note: r.note,
      conditionName: r.condition_name,
      groupName: r.group_name,
    })),
  };
}
