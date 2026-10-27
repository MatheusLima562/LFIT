"use client";

import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Check, Lock, Pencil, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addListItem, moveListItem, renameListItem, setListItemArchived, type ListActionResult } from "../actions";
import type { ListKind, ListRow } from "../queries";

const t = messages.trainingLists;

export function TrainingListsManager({ lists, isOwner }: { lists: Record<ListKind, ListRow[]>; isOwner: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {!isOwner && (
        <p className="flex items-center gap-1.5 rounded-xl bg-canvas px-3 py-2 text-[13px] text-ink-2">
          <Lock aria-hidden className="size-4" />
          {t.readOnly}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {(["methods", "objectives"] as const).map((kind) => (
          <ListCard key={kind} kind={kind} rows={lists[kind]} isOwner={isOwner} />
        ))}
      </div>
    </div>
  );
}

function ListCard({ kind, rows, isOwner }: { kind: ListKind; rows: ListRow[]; isOwner: boolean }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const run = (fn: () => Promise<ListActionResult>, then?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      if (r.message) toast.success(r.message);
      then?.();
    });
  const title = t[kind];
  const active = rows.filter((r) => !r.archived);

  return (
    <section aria-labelledby={`list-${kind}`} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <h2 id={`list-${kind}`} className="text-base font-semibold text-ink">
        {title} <span className="tabular text-[13px] font-normal text-ink-3">{active.length}</span>
      </h2>
      <ol className="flex flex-col divide-y divide-line">
        {rows.map((r) => {
          const idx = active.findIndex((x) => x.id === r.id);
          return (
            <li key={r.id} className={cn("flex items-center gap-2 py-2", r.archived && "opacity-60")}>
              {editing?.id === r.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(() => renameListItem(kind, r.id, editing.name), () => setEditing(null));
                  }}
                >
                  <Input aria-label={t.rename(r.name)} value={editing.name} maxLength={60} autoFocus onChange={(e) => setEditing({ id: r.id, name: e.target.value })} className="h-8" />
                  <Button type="submit" size="sm" disabled={pending}>
                    <Check aria-hidden />
                    {t.save}
                  </Button>
                </form>
              ) : (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] text-ink">
                    {r.name}
                    {r.archived && <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">{t.archivedBadge}</span>}
                  </p>
                  {r.uses > 0 && <p className="text-[11px] text-ink-3">{t.uses(r.uses)}</p>}
                </div>
              )}
              {isOwner && editing?.id !== r.id && (
                <div className="flex shrink-0 items-center">
                  {!r.archived && (
                    <>
                      <Button variant="ghost" size="icon-sm" aria-label={t.moveUp(r.name)} disabled={pending || idx <= 0} onClick={() => run(() => moveListItem(kind, r.id, -1))}>
                        <ArrowUp aria-hidden />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={t.moveDown(r.name)} disabled={pending || idx === active.length - 1} onClick={() => run(() => moveListItem(kind, r.id, 1))}>
                        <ArrowDown aria-hidden />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={t.rename(r.name)} disabled={pending} onClick={() => setEditing({ id: r.id, name: r.name })}>
                        <Pencil aria-hidden />
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={r.archived ? t.restore(r.name) : t.archive(r.name)}
                    disabled={pending}
                    onClick={() => run(() => setListItemArchived(kind, r.id, !r.archived))}
                  >
                    {r.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {isOwner && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addListItem(kind, name), () => setName(""));
          }}
        >
          <Input aria-label={t.addLabel(title)} placeholder={t.placeholder} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" variant="outline" disabled={pending || name.trim().length < 2}>
            <Plus aria-hidden />
            {t.add}
          </Button>
        </form>
      )}
    </section>
  );
}
