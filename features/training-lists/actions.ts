"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { dbErrorMessage, messages } from "@/messages/pt-BR";

const t = messages.trainingLists;
export type ListActionResult = { ok: true; message: string } | { ok: false; error: string };

const kindSchema = z.enum(["methods", "objectives"]);
const nameSchema = z.string().trim().min(2, messages.validation.required).max(60);
const table = (kind: "methods" | "objectives") => (kind === "methods" ? "training_methods" : "training_objectives");

async function ownerOnly() {
  const session = await getSession();
  return session?.role === "owner" ? session : null;
}

function done(message: string): ListActionResult {
  revalidatePath("/treinos/listas");
  return { ok: true, message };
}

/** Só o owner gerencia as listas (RLS também exige owner). */
export async function addListItem(kind: unknown, name: unknown): Promise<ListActionResult> {
  const k = kindSchema.safeParse(kind);
  const n = nameSchema.safeParse(name);
  if (!k.success || !n.success) return { ok: false, error: n.success ? messages.dbErrors.INVALID_INPUT : n.error.issues[0].message };
  const session = await ownerOnly();
  if (!session) return { ok: false, error: t.ownerOnly };
  const supabase = await createClient();
  const { data: last } = await supabase.from(table(k.data)).select("position").order("position", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from(table(k.data)).insert({ organization_id: session.organizationId, name: n.data, position: (last?.position ?? -1) + 1 });
  if (error?.code === "23505") return { ok: false, error: t.exists };
  if (error) return { ok: false, error: dbErrorMessage(error) };
  return done(t.added);
}

export async function renameListItem(kind: unknown, id: unknown, name: unknown): Promise<ListActionResult> {
  const k = kindSchema.safeParse(kind);
  const i = z.uuid().safeParse(id);
  const n = nameSchema.safeParse(name);
  if (!k.success || !i.success || !n.success) return { ok: false, error: n.success ? messages.dbErrors.INVALID_INPUT : n.error.issues[0].message };
  if (!(await ownerOnly())) return { ok: false, error: t.ownerOnly };
  const supabase = await createClient();
  const { data, error } = await supabase.from(table(k.data)).update({ name: n.data }).eq("id", i.data).select("id");
  if (error?.code === "23505") return { ok: false, error: t.exists };
  if (error || !data?.length) return { ok: false, error: dbErrorMessage(error) };
  return done(t.renamed);
}

export async function setListItemArchived(kind: unknown, id: unknown, archived: boolean): Promise<ListActionResult> {
  const k = kindSchema.safeParse(kind);
  const i = z.uuid().safeParse(id);
  if (!k.success || !i.success) return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  if (!(await ownerOnly())) return { ok: false, error: t.ownerOnly };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(table(k.data))
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", i.data)
    .select("id");
  if (error || !data?.length) return { ok: false, error: dbErrorMessage(error) };
  return done(archived ? t.archived : t.restored);
}

/** Troca a posição com o vizinho (lista inteira renumerada para ficar contígua). */
export async function moveListItem(kind: unknown, id: unknown, delta: -1 | 1): Promise<ListActionResult> {
  const k = kindSchema.safeParse(kind);
  const i = z.uuid().safeParse(id);
  if (!k.success || !i.success || (delta !== -1 && delta !== 1)) return { ok: false, error: messages.dbErrors.INVALID_INPUT };
  if (!(await ownerOnly())) return { ok: false, error: t.ownerOnly };
  const supabase = await createClient();
  const { data: rows } = await supabase.from(table(k.data)).select("id").order("position").order("name");
  const ids = (rows ?? []).map((r) => r.id);
  const from = ids.indexOf(i.data);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return { ok: true, message: "" };
  [ids[from], ids[to]] = [ids[to], ids[from]];
  for (const [position, rowId] of ids.entries()) {
    const { error } = await supabase.from(table(k.data)).update({ position }).eq("id", rowId);
    if (error) return { ok: false, error: dbErrorMessage(error) };
  }
  return done("");
}
