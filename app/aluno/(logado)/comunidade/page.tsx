import type { Metadata } from "next";
import { getMyProfile } from "@/features/student-app/queries";
import { getMyFeed } from "@/features/feed/queries";
import { StudentFeed } from "@/features/feed/components/StudentFeed";
import { messages } from "@/messages/pt-BR";

const t = messages.feed.student;

export const metadata: Metadata = { title: t.title };

/** Comunidade (feed do personal), fase 1: o aluno lê e curte; não publica nem comenta. */
export default async function StudentCommunityPage() {
  const [feed, profile] = await Promise.all([getMyFeed(), getMyProfile().catch(() => null)]);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{t.title}</h1>
        <p className="mt-0.5 text-sm text-ink-2">{t.subtitle(profile?.trainer_name ?? null)}</p>
      </div>
      <StudentFeed posts={feed.posts} lastSeenAt={feed.lastSeenAt} />
    </div>
  );
}
