import "server-only";
import { createClient } from "@/lib/db/server";
import { parseInviteStatus, type InviteStatus } from "./invites";

/** Status do convite por aluno (só os que o chamador acessa). Falha → mapa vazio (a coluna fica em branco). */
export async function getInviteStatuses(studentIds: string[]): Promise<Map<string, { status: InviteStatus; expiresAt: string | null }>> {
  const map = new Map<string, { status: InviteStatus; expiresAt: string | null }>();
  if (!studentIds.length) return map;
  const supabase = await createClient();
  const { data } = await supabase.rpc("student_invite_statuses", { p_student_ids: studentIds });
  for (const r of (data ?? []) as { student_id: string; status: string; expires_at: string | null }[]) {
    map.set(r.student_id, { status: parseInviteStatus(r.status), expiresAt: r.expires_at });
  }
  return map;
}

export interface InvitableStudent {
  id: string;
  fullName: string;
  firstName: string;
  whatsapp: string | null;
  status: InviteStatus;
  expiresAt: string | null;
}

/** Alunos ainda sem login (inclusive importados em pré-cadastro), com o status do último convite. */
export async function listInvitableStudents(): Promise<InvitableStudent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("students_with_status")
    .select("id, full_name, first_name, whatsapp_e164")
    .is("user_id", null)
    .order("full_name")
    .limit(500);
  const rows = (data ?? []) as { id: string; full_name: string; first_name: string; whatsapp_e164: string | null }[];
  const statuses = await getInviteStatuses(rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    firstName: r.first_name,
    whatsapp: r.whatsapp_e164,
    status: statuses.get(r.id)?.status ?? "none",
    expiresAt: statuses.get(r.id)?.expiresAt ?? null,
  }));
}

export async function getInviteQuota(): Promise<{ limit: number; remaining: number }> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_invite_quota");
  const r = (data ?? {}) as { limit?: number; remaining?: number };
  return { limit: r.limit ?? 0, remaining: r.remaining ?? 0 };
}
