import type { Metadata } from "next";
import { FeedManager } from "@/features/feed/components/FeedManager";
import { listFeedClasses, listStaffFeed } from "@/features/feed/queries";
import { requireStaff } from "@/lib/auth/session";
import { messages } from "@/messages/pt-BR";

const t = messages.feed;

export const metadata: Metadata = { title: t.title };

/** Feed (Comunidade) do painel: o personal (e professores da equipe) publica para os alunos. */
export default async function FeedPage() {
  const session = await requireStaff();
  const [posts, classes] = await Promise.all([listStaffFeed(), listFeedClasses()]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-[22px]">{t.title}</h1>
        <p className="mt-0.5 max-w-2xl text-[13px] text-ink-2">{t.subtitle}</p>
      </header>
      <FeedManager
        posts={posts}
        orgId={session.organizationId}
        isOwner={session.role === "owner"}
        classes={classes}
        now={new Date().toISOString()}
      />
    </div>
  );
}
