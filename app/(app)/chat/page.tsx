import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { StudentAvatar } from "@/components/students/StudentAvatar";
import { ChatInbox } from "@/features/chat/components/ChatInbox";
import { ChatThread } from "@/features/chat/components/ChatThread";
import { getChatMessages, getInbox, getStaffNames } from "@/features/chat/queries";
import { requireStaff } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";

const t = messages.chat;

export const metadata: Metadata = { title: t.inbox.title };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Caixa de conversas do professor: lista + conversa (duas colunas no desktop, uma no celular). */
export default async function ChatPage({ searchParams }: PageProps<"/chat">) {
  const session = await requireStaff();
  const { aluno } = await searchParams;
  const requested = typeof aluno === "string" && UUID.test(aluno) ? aluno : null;

  const inbox = await getInbox();
  // Só abre conversa de aluno que o chamador acessa (a caixa já vem filtrada por can_access_student).
  const selected = requested ? (inbox.find((e) => e.studentId === requested) ?? null) : null;
  const [initial, staffNames] = selected
    ? await Promise.all([getChatMessages(selected.studentId), getStaffNames(session.organizationId)])
    : [[], {}];

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 lg:h-dvh">
      <section
        aria-labelledby="inbox-title"
        className={cn("flex min-h-0 w-full flex-col border-line bg-surface lg:w-80 lg:shrink-0 lg:border-r", requested && "hidden lg:flex")}
      >
        <header className="border-b border-line px-4 py-4">
          <h1 id="inbox-title" className="text-lg font-semibold tracking-tight text-ink">
            {t.inbox.title}
          </h1>
          <p className="text-xs text-ink-3">{t.inbox.subtitle}</p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ChatInbox initial={inbox} selectedId={selected?.studentId ?? null} />
        </div>
      </section>

      <section className={cn("min-h-0 min-w-0 flex-1 flex-col bg-canvas", requested ? "flex" : "hidden lg:flex")}>
        {selected ? (
          <ChatThread
            key={selected.studentId}
            className="mx-auto h-full w-full max-w-3xl"
            studentId={selected.studentId}
            viewer={{ role: "staff", staffId: session.userId }}
            initial={initial}
            emptyText={t.emptyStaff}
            staffNames={staffNames}
            studentLabel={selected.name}
            header={
              <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2.5">
                <Link
                  href="/chat"
                  aria-label={t.inbox.back}
                  className="grid size-9 place-items-center rounded-lg text-ink-2 outline-none hover:bg-canvas focus-visible:ring-2 focus-visible:ring-ring/50 lg:hidden"
                >
                  <ChevronLeft aria-hidden className="size-5" />
                </Link>
                <StudentAvatar name={selected.name} photoUrl={selected.photoUrl} />
                <h2 className="truncate text-[15px] font-semibold text-ink">{selected.name}</h2>
              </div>
            }
          />
        ) : (
          <p className="m-auto px-6 text-center text-sm text-ink-3">{requested ? t.inbox.notFound : t.inbox.pick}</p>
        )}
      </section>
    </div>
  );
}
