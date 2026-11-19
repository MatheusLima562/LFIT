import "server-only";
import { createClient } from "@/lib/db/server";
import { conversationOrder } from "./state";

export interface AssistantConversation {
  sessionId: string;
  workoutLabel: string;
  startedAt: string;
  messages: { id: string; seq: number; role: "student" | "assistant"; kind: string; body: string; createdAt: string }[];
}

/**
 * Conversas do aluno com o Assistente de IA (últimos 90 dias). O RLS de `ai_messages` só devolve linhas a quem vê a
 * saúde do aluno (`can_view_student_health`); os demais recebem lista vazia e a seção some.
 */
export async function getAssistantConversations(studentId: string): Promise<AssistantConversation[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("ai_messages")
    .select("id, seq, session_id, role, kind, body, created_at")
    .eq("student_id", studentId)
    .gte("created_at", since)
    .order("seq", { ascending: true })
    .limit(300);
  if (error || !data?.length) return [];
  const ids = [...new Set(data.map((m) => m.session_id))];
  const { data: sessions } = await supabase.from("workout_sessions").select("id, workout_label, started_at").in("id", ids);
  const info = new Map((sessions ?? []).map((s) => [s.id, s]));
  const bySession = new Map<string, AssistantConversation>();
  for (const m of data) {
    const s = info.get(m.session_id);
    const conv = bySession.get(m.session_id) ?? {
      sessionId: m.session_id,
      workoutLabel: s?.workout_label ?? "",
      startedAt: s?.started_at ?? m.created_at,
      messages: [],
    };
    conv.messages.push({ id: m.id, seq: m.seq, role: m.role === "assistant" ? "assistant" : "student", kind: m.kind, body: m.body, createdAt: m.created_at });
    bySession.set(m.session_id, conv);
  }
  for (const c of bySession.values()) c.messages = conversationOrder(c.messages);
  return [...bySession.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
