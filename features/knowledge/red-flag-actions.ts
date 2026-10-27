"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/db/server";
import { parseBRDate } from "@/lib/dates";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { redFlagCheckSchema, redFlagClearanceSchema } from "./red-flag-schemas";

const t = messages.redFlags;
export type RedFlagActionResult = { ok: true; message: string } | { ok: false; error: string };

function revalidate() {
  revalidatePath("/alunos");
  revalidatePath("/treinos", "layout");
}

/** Triagem: RPC SECURITY DEFINER (owner ou professor responsável; não depende do consentimento) e auditoria no banco. */
export async function recordRedFlagCheck(studentId: string, input: unknown): Promise<RedFlagActionResult> {
  if (!z.uuid().safeParse(studentId).success) return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  const parsed = redFlagCheckSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? messages.dbErrors.INVALID_INPUT };
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_red_flag_check", {
    p_student_id: studentId,
    p_items: parsed.data.noneObserved ? [] : parsed.data.items,
    p_referred: !parsed.data.noneObserved && parsed.data.referred,
    p_note: parsed.data.note || undefined,
  });
  if (error) return { ok: false, error: dbErrorMessage(error) };
  revalidate();
  return { ok: true, message: t.checkSaved };
}

export async function recordRedFlagClearance(checkId: string, input: unknown): Promise<RedFlagActionResult> {
  if (!z.uuid().safeParse(checkId).success) return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  const parsed = redFlagClearanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? messages.dbErrors.INVALID_INPUT };
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_red_flag_clearance", {
    p_check_id: checkId,
    p_kind: parsed.data.kind,
    p_name: parsed.data.name,
    p_on: parseBRDate(parsed.data.on)!,
    p_note: parsed.data.note || undefined,
  });
  if (error?.message === "INVALID_INPUT") return { ok: false, error: t.clearanceInvalid };
  if (error) return { ok: false, error: dbErrorMessage(error) };
  revalidate();
  return { ok: true, message: t.clearanceSaved };
}
