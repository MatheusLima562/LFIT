"use client";

import Link from "next/link";
import { Check, HeartPulse, Pencil, Plus, ShieldAlert, Trash2, Users } from "lucide-react";
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

export interface ConditionChoice {
  id: string;
  name: string;
  isGlobal: boolean;
}

const t = messages.groups;

export function GroupsManager({ groups, canDelete, conditions }: { groups: GroupRow[]; canDelete: boolean; conditions: ConditionChoice[] }) {
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
                <p className="mt-1 flex items-start gap-1 text-[12px] text-ink-3">
                  <ShieldAlert aria-hidden className="mt-px size-3.5 shrink-0" />
                  <span>{g.conditions.length ? g.conditions.map((c) => c.name).join(", ") : t.conditionsNone}</span>
                </p>
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

      {editing && <GroupDialog group={editing === "new" ? null : editing} conditions={conditions} onClose={() => setEditing(null)} />}

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

function GroupDialog({ group, conditions, onClose }: { group: GroupRow | null; conditions: ConditionChoice[]; onClose: () => void }) {
  const [conditionIds, setConditionIds] = useState<string[]>(group?.conditions.map((c) => c.id) ?? []);
  const [name, setName] = useState(group?.name ?? "");
  const [color, setColor] = useState<GroupColor>((GROUP_COLORS as readonly string[]).includes(group?.color ?? "") ? (group!.color as GroupColor) : GROUP_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{group ? t.edit : t.new}</DialogTitle>
          <DialogDescription>{t.subtitle}</DialogDescription>
        </DialogHeader>
        <form
          id="group-form"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const r = await saveGroup({ name, color, conditionIds }, group?.id);
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
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-ink">{t.conditions}</legend>
            <p className="text-xs text-ink-3">{t.conditionsHint}</p>
            <div className="flex flex-wrap gap-1.5">
              {conditions.map((c) => {
                const on = conditionIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setConditionIds(on ? conditionIds.filter((x) => x !== c.id) : [...conditionIds, c.id])}
                    className={cn(
                      "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                      on ? "border-brand-300 bg-brand-50 font-medium text-brand-700" : "border-line bg-surface text-ink-2 hover:text-ink",
                    )}
                  >
                    {on && <Check aria-hidden className="size-3.5" />}
                    {c.name}
                  </button>
                );
              })}
            </div>
            <Link href="/treinos/condicoes" className="w-fit rounded text-xs text-brand-700 hover:underline">
              {t.manageConditions}
            </Link>
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
