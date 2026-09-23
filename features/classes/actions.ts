"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { searchKey } from "@/lib/text";
import { dbErrorMessage, messages } from "@/messages/pt-BR";

const t = messages.classes;
export type ClassActionResult = { ok: true; message: string } | { ok: false; error: string };
export interface ClassMember {
  id: string;
  name: string;
  enrollmentNumber: number;
}

const classSchema = z.object({
  name: z.string().trim().min(2, messages.validation.required).max(80),
  trainerId: z.uuid().nullable(),
});
const id = z.uuid();

function revalidate() {
  revalidatePath("/turmas");
  revalidatePath("/alunos");
}

export async function saveClass(input: unknown, classId?: string): Promise<ClassActionResult> {
  const parsed = classSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? messages.dbErrors.INVALID_INPUT };
  if (classId && !id.safeParse(classId).success) return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  const session = await getSession();
  if (!session || session.role === "student") return { ok: false, error: messages.dbErrors.FORBIDDEN };

  // Trainer: a turma é sempre dele (o RLS também exige).
  const trainerId = session.role === "owner" ? parsed.data.trainerId : session.userId;
  const supabase = await createClient();
  const values = { name: parsed.data.name, trainer_id: trainerId };
  const { data, error } = classId
    ? await supabase.from("classes").update(values).eq("id", classId).select("id")
    : await supabase.from("classes").insert({ ...values, organization_id: session.organizationId }).select("id");
  if (error || !data?.length) return { ok: false, error: error ? dbErrorMessage(error) : t.readOnly };
  revalidate();
  return { ok: true, message: classId ? t.saved : t.created };
}

export async function deleteClass(classId: string): Promise<ClassActionResult> {
  if (!id.safeParse(classId).success) return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  const supabase = await createClient();
  const { data, error } = await supabase.from("classes").delete().eq("id", classId).select("id");
  if (error || !data?.length) return { ok: false, error: error ? dbErrorMessage(error) : t.readOnly };
  revalidate();
  return { ok: true, message: t.deleted };
}

/** Membros visíveis ao usuário (trainer vê só os seus alunos). */
export async function getClassMembers(classId: string): Promise<ClassMember[]> {
  if (!id.safeParse(classId).success) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("class_students")
    .select("students!inner(id, first_name, last_name, enrollment_number)")
    .eq("class_id", classId);
  return (data ?? [])
    .map((r) => r.students as unknown as { id: string; first_name: string; last_name: string; enrollment_number: number })
    .map((s) => ({ id: s.id, name: `${s.first_name} ${s.last_name}`, enrollmentNumber: s.enrollment_number }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/** Alunos ativos acessíveis ao usuário que ainda não estão na turma. */
export async function searchClassCandidates(classId: string, query: string): Promise<ClassMember[]> {
  if (!id.safeParse(classId).success) return [];
  const supabase = await createClient();
  const members = new Set((await getClassMembers(classId)).map((m) => m.id));
  let q = supabase
    .from("students_with_status")
    .select("id, full_name, enrollment_number")
    .in("effective_status", ["active", "blocked"])
    .order("first_name")
    .limit(30);
  const term = searchKey(query).replace(/[%_*,()\\"']/g, " ").trim();
  if (term) q = q.ilike("search_text", `%${term}%`);
  const { data } = await q;
  return (data ?? [])
    .filter((s) => s.id && !members.has(s.id))
    .slice(0, 12)
    .map((s) => ({ id: s.id!, name: s.full_name!, enrollmentNumber: s.enrollment_number! }));
}

export async function addClassMember(classId: string, studentId: string): Promise<ClassActionResult> {
  if (!id.safeParse(classId).success || !id.safeParse(studentId).success) return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  const session = await getSession();
  if (!session) return { ok: false, error: messages.dbErrors.FORBIDDEN };
  const supabase = await createClient();
  const { error } = await supabase
    .from("class_students")
    .insert({ class_id: classId, student_id: studentId, organization_id: session.organizationId });
  if (error) return { ok: false, error: error.code === "42501" ? t.readOnly : dbErrorMessage(error) };
  revalidate();
  return { ok: true, message: t.added };
}

export async function removeClassMember(classId: string, studentId: string): Promise<ClassActionResult> {
  if (!id.safeParse(classId).success || !id.safeParse(studentId).success) return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("class_students")
    .delete()
    .eq("class_id", classId)
    .eq("student_id", studentId)
    .select("class_id");
  if (error || !data?.length) return { ok: false, error: error ? dbErrorMessage(error) : t.readOnly };
  revalidate();
  return { ok: true, message: t.removed };
}
