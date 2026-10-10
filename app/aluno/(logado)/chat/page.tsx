import type { Metadata } from "next";
import { Clock, ShieldAlert } from "lucide-react";
import { ChatThread, type AttachGroup } from "@/features/chat/components/ChatThread";
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
      <h1 className="sr-only">{t.title}</h1>
      <ChatThread
        className="h-full"
        studentId={profile.student_id}
        viewer={{ role: "student", staffId: null }}
        initial={initial}
        emptyText={t.emptyStudent}
        attachGroups={attachGroups}
        header={
          <div className="mx-4 flex flex-col gap-1.5 rounded-xl bg-warning-soft px-3 py-2.5 text-[13px] ring-1 ring-warning-line">
            <p className="flex gap-2 font-medium text-warning-ink">
              <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{t.emergency}</span>
            </p>
            <p className="pl-6 text-ink-2">{t.visibility}</p>
            {profile.trainer_office_hours && (
              <p className="flex items-center gap-2 text-ink-2">
                <Clock aria-hidden className="size-4 shrink-0 text-ink-3" />
                <span>
                  {profile.trainer_name ? `${profile.trainer_name} · ` : ""}
                  {t.officeHours(profile.trainer_office_hours)}
                </span>
              </p>
            )}
          </div>
        }
      />
    </div>
  );
}
