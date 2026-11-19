"use client";

import { Heart, Pin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/db/client";
import { formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { isNewForStudent } from "../feed";
import type { StudentFeedItem } from "../queries";
import { FeedPostContent } from "./FeedPostContent";

const t = messages.feed;

/**
 * Feed do aluno: fixados no topo, depois do mais novo para o mais antigo. "Novo" = publicado depois da última visita.
 * Ao abrir, marca o feed como visto (sem push). Curtir vai do navegador direto para `toggle_feed_like`; o aluno vê só
 * a contagem e o próprio estado — nunca quem curtiu.
 */
export function StudentFeed({ posts, lastSeenAt }: { posts: StudentFeedItem[]; lastSeenAt: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [likes, setLikes] = useState(() => new Map(posts.map((p) => [p.id, { count: p.likeCount, liked: p.liked }])));
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void supabase.rpc("mark_feed_seen").then(() => {}, () => {});
  }, [supabase]);

  const toggle = async (id: string) => {
    const current = likes.get(id);
    if (!current || busy) return;
    const next = !current.liked;
    setBusy(id);
    setLikes((m) => new Map(m).set(id, { count: Math.max(0, current.count + (next ? 1 : -1)), liked: next }));
    try {
      const { data, error } = await supabase.rpc("toggle_feed_like", { p_post_id: id, p_like: next });
      const r = (data ?? {}) as { like_count?: number; liked?: boolean };
      if (error || typeof r.like_count !== "number") throw new Error("like");
      setLikes((m) => new Map(m).set(id, { count: r.like_count!, liked: r.liked === true }));
    } catch {
      setLikes((m) => new Map(m).set(id, current));
      toast.error(t.student.likeFailed);
    } finally {
      setBusy(null);
    }
  };

  if (posts.length === 0) {
    return <p className="rounded-2xl bg-surface p-5 text-sm text-ink-2 ring-1 ring-line">{t.student.empty}</p>;
  }

  return (
    <>
      <ol className="flex flex-col gap-4" aria-label={t.student.title}>
        {posts.map((p) => {
          const like = likes.get(p.id) ?? { count: p.likeCount, liked: p.liked };
          const isNew = isNewForStudent(p.publishedAt, lastSeenAt);
          return (
            <li key={p.id}>
              <article className="flex flex-col gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
                <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                  {p.pinned && (
                    <span className="inline-flex items-center gap-1 font-medium text-ink-2">
                      <Pin aria-hidden className="size-3.5" />
                      {t.pinned}
                    </span>
                  )}
                  {isNew && <span className="rounded-full bg-selected-soft px-2 py-0.5 font-medium text-ink ring-1 ring-selected-line">{t.student.new}</span>}
                  <span>
                    {p.authorFirstName ? `${p.authorFirstName} · ` : ""}
                    <time dateTime={p.publishedAt}>{`${formatDate(p.publishedAt)} ${formatTime(p.publishedAt)}`}</time>
                  </span>
                </header>
                <FeedPostContent kind={p.kind} body={p.body} imageUrl={p.imageUrl} videoUrl={p.videoUrl} />
                <div>
                  <button
                    type="button"
                    aria-pressed={like.liked}
                    aria-label={t.student.likeLabel(like.liked, like.count)}
                    disabled={busy === p.id}
                    onClick={() => void toggle(p.id)}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium ring-1 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      like.liked ? "bg-selected-soft text-ink ring-selected-line" : "bg-surface text-ink-2 ring-line",
                    )}
                  >
                    <Heart aria-hidden className={cn("size-4", like.liked && "fill-current")} />
                    <span aria-hidden>{like.count}</span>
                  </button>
                </div>
              </article>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-center text-xs text-ink-3">{t.student.privacy}</p>
    </>
  );
}
