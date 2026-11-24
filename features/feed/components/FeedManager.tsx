"use client";

import { useRouter } from "next/navigation";
import { CalendarClock, Heart, Pencil, Pin, PinOff, Plus, Trash2, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { callAction } from "@/lib/action";
import { createClient } from "@/lib/db/client";
import { deleteFeedPost } from "../actions";
import { formatDate, formatTime } from "@/lib/format";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { isScheduled } from "../feed";
import type { StaffFeedItem } from "../queries";
import { FeedEditor } from "./FeedEditor";
import { FeedPostContent } from "./FeedPostContent";

const t = messages.feed;
const when = (iso: string) => `${formatDate(iso)} ${formatTime(iso)}`;

function audienceSummary(p: StaffFeedItem) {
  if (p.audience === "modality" && p.audienceModality) return t.audience.summaryModality(t.modality[p.audienceModality]);
  if (p.audience === "class") return t.audience.summaryClass(p.audienceClassName);
  return t.audience.summaryAll;
}

/** Página "Feed" do painel: criar, prévia, editar, fixar, agendar, apagar; contagem de curtidas (nunca quem curtiu). */
export function FeedManager({ posts, orgId, isOwner, classes, now, startPinned = null }: {
  posts: StaffFeedItem[];
  orgId: string;
  isOwner: boolean;
  classes: { id: string; name: string }[];
  now: string;
  /** Abrir já o editor de um "recado para todos" (post fixado até este dia), vindo do Chat. */
  startPinned?: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [editing, setEditing] = useState<StaffFeedItem | "new" | null>(startPinned ? "new" : null);
  const [defaults, setDefaults] = useState(startPinned ? { pinned: true, unpinDay: startPinned } : null);
  const [deleting, setDeleting] = useState<StaffFeedItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const reference = new Date(now);

  const run = async (postId: string, fn: () => PromiseLike<{ error: { message?: string; code?: string } | null }>, ok: string) => {
    setBusy(postId);
    try {
      const { error } = await fn();
      if (error) return void toast.error(dbErrorMessage(error));
      toast.success(ok);
      router.refresh();
    } catch {
      toast.error(t.failed);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button type="button" onClick={() => setEditing("new")}>
          <Plus aria-hidden />
          {t.newPost}
        </Button>
      </div>

      {posts.length === 0 ? (
        <p className="rounded-2xl bg-surface p-5 text-sm text-ink-2 ring-1 ring-line">{t.empty}</p>
      ) : (
        <ol className="flex max-w-2xl flex-col gap-4" aria-label={t.title}>
          {posts.map((p) => {
            const scheduled = isScheduled(p.publishedAt, reference);
            return (
              <li key={p.id}>
                <article className="flex flex-col gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
                  <header className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                    {p.pinned && (
                      <span className="inline-flex items-center gap-1 font-medium text-ink-2">
                        <Pin aria-hidden className="size-3.5" />
                        {p.unpinAt ? t.pinnedUntil(formatDate(p.unpinAt)) : t.pinned}
                      </span>
                    )}
                    {scheduled ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 font-medium text-info-ink ring-1 ring-info-line">
                        <CalendarClock aria-hidden className="size-3.5" />
                        {t.schedule.scheduled(when(p.publishedAt))}
                      </span>
                    ) : (
                      <time dateTime={p.publishedAt}>{when(p.publishedAt)}</time>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Users aria-hidden className="size-3.5" />
                      {audienceSummary(p)}
                    </span>
                    {p.authorName && <span>{t.by(p.authorName)}</span>}
                  </header>
                  <FeedPostContent kind={p.kind} body={p.body} imageUrl={p.imageUrl} videoUrl={p.videoUrl} />
                  <footer className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-sm text-ink-2">
                      <Heart aria-hidden className="size-4" />
                      {t.likes(p.likeCount)}
                    </span>
                    {p.canEdit && (
                      <div className="flex flex-wrap gap-2" role="group" aria-label={t.actions(when(p.publishedAt))}>
                        <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => setEditing(p)}>
                          <Pencil aria-hidden />
                          {t.edit}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy !== null}
                          onClick={() =>
                            void run(p.id, () => supabase.rpc("set_feed_post_pinned", { p_id: p.id, p_pinned: !p.pinned }), p.pinned ? t.unpinnedToast : t.pinnedToast)
                          }
                        >
                          {p.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
                          {p.pinned ? t.unpin : t.pin}
                        </Button>
                        <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => setDeleting(p)}>
                          <Trash2 aria-hidden />
                          {t.delete}
                        </Button>
                      </div>
                    )}
                  </footer>
                </article>
              </li>
            );
          })}
        </ol>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) { setEditing(null); setDefaults(null); } }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? t.newPost : t.editPost}</DialogTitle>
            <DialogDescription>{t.subtitle}</DialogDescription>
          </DialogHeader>
          {editing !== null && (
            <FeedEditor
              key={editing === "new" ? "new" : editing.id}
              orgId={orgId}
              isOwner={isOwner}
              classes={classes}
              post={editing === "new" ? null : editing}
              defaults={editing === "new" ? defaults : null}
              onDone={() => {
                setEditing(null);
                setDefaults(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t.deleteTitle}
        description={t.deleteText}
        confirmLabel={t.delete}
        destructive
        pending={busy !== null}
        onConfirm={() => {
          const p = deleting;
          if (!p) return;
          setDeleting(null);
          // Server action: a RPC autoriza com a sessão; depois o servidor apaga o arquivo da imagem no Storage.
          void (async () => {
            setBusy(p.id);
            try {
              const r = await callAction(() => deleteFeedPost(p.id));
              if (!r) return;
              // Erro: o post continua na lista (o servidor desfez o apagamento); a lista é relida para refletir o banco.
              if (!r.ok) {
                toast.error(r.error);
                router.refresh();
                return;
              }
              toast.success(t.deleted);
              router.refresh();
            } finally {
              setBusy(null);
            }
          })();
        }}
      />
    </div>
  );
}
