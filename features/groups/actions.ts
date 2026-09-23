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

  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("special_groups").update(parsed.data).eq("id", id).select("id")
    : await supabase.from("special_groups").insert({ ...parsed.data, organization_id: session.organizationId }).select("id");
  if (error?.code === "23505") return { ok: false, error: t.exists };
  if (error || !data?.length) return { ok: false, error: dbErrorMessage(error) };
  revalidate();
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
