"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { GROUP_COLORS } from "./colors";

const t = messages.groups;
export type GroupActionResult = { ok: true; message: string } | { ok: false; error: string };

const groupSchema = z.object({
  name: z.string().trim().min(2, messages.validation.required).max(60),
  color: z.enum(GROUP_COLORS),
  conditionIds: z.array(z.uuid()).max(30).default([]),
});

function revalidate() {
  revalidatePath("/alunos/grupos");
  revalidatePath("/alunos");
}

export async function saveGroup(input: unknown, id?: string): Promise<GroupActionResult> {
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? messages.dbErrors.INVALID_INPUT };
  if (id && !z.uuid().safeParse(id).success) return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  const session = await getSession();
  if (!session || session.role === "student") return { ok: false, error: messages.dbErrors.FORBIDDEN };

  const { conditionIds, ...group } = parsed.data;
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("special_groups").update(group).eq("id", id).select("id")
    : await supabase.from("special_groups").insert({ ...group, organization_id: session.organizationId }).select("id");
  if (error?.code === "23505") return { ok: false, error: t.exists };
  if (error || !data?.length) return { ok: false, error: dbErrorMessage(error) };

  // Vínculos grupo ↔ condição: primeiro adiciona, depois remove (uma falha nunca apaga alertas existentes).
  const groupId = data[0].id;
  const { data: current } = await supabase
    .from("special_group_conditions")
    .select("condition_id, condition:health_conditions(archived_at)")
    .eq("group_id", groupId);
  const have = new Set((current ?? []).map((c) => c.condition_id));
  const toAdd = conditionIds.filter((c) => !have.has(c));
  // Vínculos com condições arquivadas não aparecem no formulário: são preservados (voltam ao restaurar).
  const toRemove = (current ?? [])
    .filter((c) => !conditionIds.includes(c.condition_id) && !(c.condition as { archived_at: string | null } | null)?.archived_at)
    .map((c) => c.condition_id);
  if (toAdd.length) {
    const r = await supabase
      .from("special_group_conditions")
      .insert(toAdd.map((condition_id) => ({ group_id: groupId, condition_id, organization_id: session.organizationId })));
    if (r.error) return { ok: false, error: dbErrorMessage(r.error) };
  }
  if (toRemove.length) {
    const r = await supabase.from("special_group_conditions").delete().eq("group_id", groupId).in("condition_id", toRemove);
    if (r.error) return { ok: false, error: dbErrorMessage(r.error) };
  }
  revalidate();
  revalidatePath("/treinos/condicoes");
  return { ok: true, message: id ? t.saved : t.created };
}

export async function deleteGroup(id: string): Promise<GroupActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  const supabase = await createClient();
  // RLS: só o owner exclui; sem permissão a exclusão afeta 0 linhas.
  const { data, error } = await supabase.from("special_groups").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: dbErrorMessage(error) };
  if (!data?.length) return { ok: false, error: t.ownerOnlyDelete };
  revalidate();
  return { ok: true, message: t.deleted };
}
