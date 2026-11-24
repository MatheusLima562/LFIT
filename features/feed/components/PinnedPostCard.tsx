import Link from "next/link";
import { Pin } from "lucide-react";
import { messages } from "@/messages/pt-BR";
import { FeedText } from "./FeedPostContent";

const t = messages.feed.today;

/**
 * Hoje do aluno: o post fixado mais recente do feed (o antigo "recado para todos"). Texto completo; imagem/vídeo ficam
 * na Comunidade (só a indicação aqui, para não carregar mídia de terceiros no Hoje).
 */
export function PinnedPostCard({ post }: { post: { kind: "text" | "image" | "video"; body: string; authorFirstName: string } }) {
  return (
    <section aria-labelledby="pinned-title" className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <h2 id="pinned-title" className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-3 uppercase">
        <Pin aria-hidden className="size-3.5" />
        {post.authorFirstName ? `${t.title} · ${post.authorFirstName}` : t.title}
      </h2>
      <div className="line-clamp-6">
        <FeedText body={post.body} />
      </div>
      {post.kind !== "text" && <p className="text-xs text-ink-3">{t.media[post.kind]}</p>}
      <Link href="/aluno/comunidade" className="link self-start text-sm">{t.more}</Link>
    </section>
  );
}
