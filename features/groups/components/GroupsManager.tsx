"use client";

import Link from "next/link";
import { Check, HeartPulse, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { deleteGroup, saveGroup } from "../actions";
import { GROUP_COLORS, type GroupColor } from "../colors";
import type { GroupRow } from "../queries";

const t = messages.groups;

export function GroupsManager({ groups, canDelete }: { groups: GroupRow[]; canDelete: boolean }) {
  const [editing, setEditing] = useState<GroupRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<GroupRow | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button onClick={() => setEditing("new")}>
          <Plus aria-hidden />
          {t.new}
        </Button>
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={<HeartPulse />} message={t.empty} className="min-h-48 bg-surface" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <li key={g.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
              <span aria-hidden className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: g.color }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-ink">{g.name}</p>
                <Link
                  href={`/alunos?grupo=${g.id}`}
                  className="inline-flex items-center gap-1 rounded text-[13px] text-brand-700 hover:underline"
                  title={t.studentsHint}
                >
                  <Users aria-hidden className="size-3.5" />
                  {t.students(g.students)}
                </Link>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label={`${t.edit}: ${g.name}`} onClick={() => setEditing(g)}>
                <Pencil aria-hidden />
              </Button>
              {canDelete && (
                <Button variant="ghost" size="icon-sm" aria-label={`Excluir ${g.name}`} className="hover:text-danger" onClick={() => setDeleting(g)}>
                  <Trash2 aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && <GroupDialog group={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t.deleteTitle}
        description={deleting ? t.deleteText(deleting.name, deleting.students) : ""}
        confirmLabel="Excluir"
        cancelLabel={messages.students.confirm.cancel}
        destructive
        pending={pending}
        requireText={deleting && deleting.students > 0 ? { expected: deleting.name, label: "Digite o nome do grupo para confirmar" } : undefined}
        onConfirm={() =>
          startTransition(async () => {
            if (!deleting) return;
            const r = await deleteGroup(deleting.id);
            if (r.ok) {
              toast.success(r.message);
              setDeleting(null);
            } else toast.error(r.error);
          })
        }
      />
    </div>
  );
}

function GroupDialog({ group, onClose }: { group: GroupRow | null; onClose: () => void }) {
  const [name, setName] = useState(group?.name ?? "");
  const [color, setColor] = useState<GroupColor>((GROUP_COLORS as readonly string[]).includes(group?.color ?? "") ? (group!.color as GroupColor) : GROUP_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{group ? t.edit : t.new}</DialogTitle>
          <DialogDescription>{t.subtitle}</DialogDescription>
        </DialogHeader>
        <form
          id="group-form"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const r = await saveGroup({ name, color }, group?.id);
              if (!r.ok) return setError(r.error);
              toast.success(r.message);
              onClose();
            });
          }}
          className="flex flex-col gap-4"
        >
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="group-name">{t.name}</FieldLabel>
            <Input id="group-name" value={name} maxLength={60} placeholder={t.namePlaceholder} onChange={(e) => setName(e.target.value)} aria-invalid={!!error} autoFocus />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-ink">{t.color}</legend>
            <div role="radiogroup" aria-label={t.color} className="flex flex-wrap gap-2">
              {GROUP_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={t.colorOption(c)}
                  onClick={() => setColor(c)}
                  className={cn(
                    "grid size-8 place-items-center rounded-full outline-none ring-offset-2 ring-offset-surface transition focus-visible:ring-2 focus-visible:ring-ring/50",
                    color === c && "ring-2 ring-ink",
                  )}
                  style={{ backgroundColor: c }}
                >
                  {color === c && <Check aria-hidden className="size-4 text-white" />}
                </button>
              ))}
            </div>
          </fieldset>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>{messages.students.confirm.cancel}</Button>
          <Button type="submit" form="group-form" disabled={pending || name.trim().length < 2}>
            {group ? t.save : t.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
