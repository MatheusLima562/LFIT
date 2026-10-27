import type { Metadata } from "next";
import { ChatThread, type AttachGroup } from "@/features/chat/components/ChatThread";
import { StudentChatHeader } from "@/features/chat/components/StudentChatHeader";
import { getChatMessages } from "@/features/chat/queries";
import { getMyActivePlan, getMyProfile } from "@/features/student-app/queries";
import { messages } from "@/messages/pt-BR";

const t = messages.chat;

export const metadata: Metadata = { title: t.title };

export default async function StudentChatPage() {
  // Roda em paralelo ao layout: sem perfil/acesso, quem mostra o portão é o layout.
  const profile = await getMyProfile();
  if (!profile || profile.effective_status !== "active") return null;

  const [initial, active] = await Promise.all([getChatMessages(profile.student_id), getMyActivePlan().catch(() => null)]);
  const attachGroups: AttachGroup[] = (active?.workouts ?? []).map((w) => ({
    label: w.name ? `Treino ${w.label} · ${w.name}` : `Treino ${w.label}`,
    items: w.items.map((it) => ({ id: it.id, name: it.exercise.name })),
  }));

  return (
    // Altura da tela menos cabeçalho (3.5rem), respiro do topo (1rem) e barra inferior (5rem) + áreas seguras.
    <div className="-mx-4 h-[calc(100dvh-9.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))]">
      <ChatThread
        className="h-full"
        studentId={profile.student_id}
        viewer={{ role: "student", staffId: null }}
        initial={initial}
        emptyText={t.emptyStudent}
        attachGroups={attachGroups}
        header={<StudentChatHeader trainerName={profile.trainer_name} officeHours={profile.trainer_office_hours} />}
      />
    </div>
  );
}
