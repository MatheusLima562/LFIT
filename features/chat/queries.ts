import "server-only";
import { createClient } from "@/lib/db/server";
import { signPhotoUrls } from "@/features/students/queries";
import type { ChatMessage } from "./types";

/** Página mais recente da conversa (RLS/RPC: vazia para quem não acessa o aluno). */
export async function getChatMessages(studentId: string): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_chat_messages", { p_student_id: studentId });
  return data ?? [];
}

export interface InboxEntry {
  studentId: string;
  name: string;
  photoUrl: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastSenderRole: "student" | "staff" | null;
  unread: number;
}

/** Caixa de conversas do staff: não lidas primeiro, depois a mais recente, depois o nome (ordem do RPC). */
export async function getInbox(): Promise<InboxEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_chat_inbox");
  const rows = data ?? [];
  const photos = await signPhotoUrls(supabase, rows.flatMap((r) => (r.photo_path ? [r.photo_path] : [])));
  return rows.map((r) => ({
    studentId: r.student_id,
    name: r.student_name,
    photoUrl: r.photo_path ? (photos.get(r.photo_path) ?? null) : null,
    lastMessage: r.last_message,
    lastMessageAt: r.last_message_at,
    lastSenderRole: r.last_sender_role === "staff" ? "staff" : r.last_sender_role === "student" ? "student" : null,
    unread: r.unread_count,
  }));
}

/** Nomes do staff da organização (RLS de profiles), para rotular quem enviou no painel. */
export async function getStaffNames(organizationId: string): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name").eq("organization_id", organizationId).in("role", ["owner", "trainer"]);
  return Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name]));
}

export async function getStaffUnread(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("staff_total_unread_count");
  return data ?? 0;
}

export async function getStudentUnread(studentId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("chat_unread_count", { p_student_id: studentId });
  return data ?? 0;
}
