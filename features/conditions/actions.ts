"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { searchKey } from "@/lib/text";
import { parseSearchTerms } from "./regions";
import { dbErrorMessage, messages } from "@/messages/pt-BR";

const t = messages.conditions;
export type ConditionActionResult = { ok: true; message: string } | { ok: false; error: string };

const conditionSchema = z.object({
  name: z.string().trim().min(2, messages.validation.required).max(80),
  description: z.string().trim().max(300),
  parentId: z.union([z.uuid(), z.literal("")]),
  searchTerms: z.string().max(700),
});

function revalidate() {
  revalidatePath("/treinos/condicoes");
  revalidatePath("/treinos/exercicios");
  revalidatePath("/alunos/grupos");
}

export async function saveCondition(input: unknown, id?: string): Promise<ConditionActionResult> {
  const parsed = conditionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? messages.dbErrors.INVALID_INPUT };
  if (id && !z.uuid().safeParse(id).success) return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  const session = await getSession();
  if (!session || session.role === "student") return { ok: false, error: messages.dbErrors.FORBIDDEN };

  const searchTerms = parseSearchTerms(parsed.data.searchTerms);
  if (searchTerms.length > 10 || searchTerms.some((s) => s.length < 2 || s.length > 60)) return { ok: false, error: t.searchTermsInvalid };
  const values = {
    name: parsed.data.name,
    description: parsed.data.description || null,
    parent_id: parsed.data.parentId || null,
    search_terms: searchTerms,
  };
  const supabase = await createClient();
  // Nome igual ao de uma condição do catálogo LFit confundiria as listas e os alertas.
  const { data: catalog } = await supabase.from("health_conditions").select("name").is("organization_id", null);
  if ((catalog ?? []).some((c) => searchKey(c.name) === searchKey(values.name))) return { ok: false, error: t.existsGlobal };

  // RLS: só condições da própria organização (globais não são editáveis).
  const { data, error } = id
    ? await supabase.from("health_conditions").update(values).eq("id", id).select("id")
    : await supabase.from("health_conditions").insert({ ...values, organization_id: session.organizationId }).select("id");
  if (error?.code === "23505") return { ok: false, error: t.exists };
  if (error?.message === "INVALID_CONDITION") return { ok: false, error: t.parentInvalid };
  if (error || !data?.length) return { ok: false, error: dbErrorMessage(error) };
  revalidate();
  return { ok: true, message: id ? t.saved : t.created };
}

export async function setConditionArchived(id: string, archived: boolean): Promise<ConditionActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  const supabase = await createClient();
  // Gatilho health_conditions_archive_guard: só o owner arquiva/restaura.
  const { data, error } = await supabase
    .from("health_conditions")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id");
  if (error?.message === "FORBIDDEN") return { ok: false, error: t.ownerOnlyArchive };
  if (error || !data?.length) return { ok: false, error: dbErrorMessage(error) };
  revalidate();
  return { ok: true, message: archived ? t.archived : t.unarchived };
}
