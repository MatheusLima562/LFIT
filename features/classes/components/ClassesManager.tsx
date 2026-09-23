"use client";

import Link from "next/link";
import { Pencil, Plus, Trash2, UserMinus, UserPlus, Users, UsersRound } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { formatEnrollment } from "@/lib/format";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StudentAvatar } from "@/components/students/StudentAvatar";
import {
  addClassMember,
  deleteClass,
  getClassMembers,
  removeClassMember,
  saveClass,
  searchClassCandidates,
  type ClassMember,
} from "../actions";
import type { ClassRow } from "../queries";

const t = messages.classes;
const NONE = "none";

interface Props {
  classes: ClassRow[];
  trainers: { id: string; name: string }[];
  isOwner: boolean;
}

export function ClassesManager({ classes, trainers, isOwner }: Props) {
  const [editing, setEditing] = useState<ClassRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<ClassRow | null>(null);
  const [members, setMembers] = useState<ClassRow | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button onClick={() => setEditing("new")}>
          <Plus aria-hidden />
          {t.new}
        </Button>
      </div>

      {classes.length === 0 ? (
        <EmptyState icon={<UsersRound />} message={t.empty} className="min-h-48 bg-surface" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((c) => (
            <li key={c.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
              <div className="flex items-start gap-3">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <UsersRound className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-ink">{c.name}</p>
                  <p className="truncate text-[13px] text-ink-3">{c.trainerName ?? t.noTrainer}</p>
                </div>
                {c.canEdit && (
                  <>
                    <Button variant="ghost" size="icon-sm" aria-label={`${t.edit}: ${c.name}`} onClick={() => setEditing(c)}>
                      <Pencil aria-hidden />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Excluir ${c.name}`} className="hover:text-danger" onClick={() => setDeleting(c)}>
                      <Trash2 aria-hidden />
                    </Button>
                  </>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
                <Link href={`/alunos?turma=${c.id}`} className="inline-flex items-center gap-1 rounded text-[13px] text-brand-700 hover:underline">
                  <Users aria-hidden className="size-3.5" />
                  {messages.groups.students(c.students)}
                </Link>
                {c.canEdit && (
                  <Button variant="outline" size="sm" onClick={() => setMembers(c)}>
                    {t.manageMembers}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <ClassDialog cls={editing === "new" ? null : editing} trainers={trainers} isOwner={isOwner} onClose={() => setEditing(null)} />
      )}
      {members && <MembersSheet cls={members} onClose={() => setMembers(null)} />}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t.deleteTitle}
        description={deleting ? t.deleteText(deleting.name) : ""}
        confirmLabel="Excluir"
        cancelLabel={messages.students.confirm.cancel}
        destructive
        pending={pending}
        onConfirm={() =>
          startTransition(async () => {
            if (!deleting) return;
            const r = await deleteClass(deleting.id);
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

function ClassDialog({ cls, trainers, isOwner, onClose }: { cls: ClassRow | null; trainers: Props["trainers"]; isOwner: boolean; onClose: () => void }) {
  const [name, setName] = useState(cls?.name ?? "");
  const [trainerId, setTrainerId] = useState(cls?.trainerId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{cls ? t.edit : t.new}</DialogTitle>
          <DialogDescription>{t.subtitle}</DialogDescription>
        </DialogHeader>
        <form
          id="class-form"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const r = await saveClass({ name, trainerId: trainerId || null }, cls?.id);
              if (!r.ok) return setError(r.error);
              toast.success(r.message);
              onClose();
            });
          }}
          className="flex flex-col gap-4"
        >
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="class-name">{t.name}</FieldLabel>
            <Input id="class-name" value={name} maxLength={80} placeholder={t.namePlaceholder} onChange={(e) => setName(e.target.value)} aria-invalid={!!error} autoFocus />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="class-trainer">{t.trainer}</FieldLabel>
            {isOwner ? (
              <Select value={trainerId || NONE} onValueChange={(v) => setTrainerId(v === NONE ? "" : v)}>
                <SelectTrigger id="class-trainer" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t.noTrainer}</SelectItem>
                  {trainers.map((tr) => (
                    <SelectItem key={tr.id} value={tr.id}>{tr.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p id="class-trainer" className="text-[13px] text-ink-2">{t.trainerSelf}</p>
            )}
          </Field>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>{messages.students.confirm.cancel}</Button>
          <Button type="submit" form="class-form" disabled={pending || name.trim().length < 2}>
            {cls ? t.save : t.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MembersSheet({ cls, onClose }: { cls: ClassRow; onClose: () => void }) {
  const [members, setMembers] = useState<ClassMember[] | null>(null);
  const [candidates, setCandidates] = useState<ClassMember[]>([]);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const reload = () =>
    startTransition(async () => {
      const [m, c] = await Promise.all([getClassMembers(cls.id), searchClassCandidates(cls.id, query)]);
      setMembers(m);
      setCandidates(c);
    });

  useEffect(() => {
    const timer = setTimeout(async () => setCandidates(await searchClassCandidates(cls.id, query)), 300);
    return () => clearTimeout(timer);
  }, [cls.id, query]);

  useEffect(() => {
    getClassMembers(cls.id).then(setMembers);
  }, [cls.id]);

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
      reload();
    });

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-line">
          <SheetTitle>{t.membersTitle(cls.name)}</SheetTitle>
          <SheetDescription>{t.membersHint}</SheetDescription>
        </SheetHeader>

        <div className="border-b border-line p-4">
          <Command shouldFilter={false} className="rounded-xl border border-line">
            <CommandInput placeholder={t.addSearch} value={query} onValueChange={setQuery} />
            <CommandList className="max-h-56">
              <CommandEmpty>{t.addEmpty}</CommandEmpty>
              {candidates.map((s) => (
                <CommandItem key={s.id} value={s.id} disabled={pending} onSelect={() => run(() => addClassMember(cls.id, s.id))}>
                  <UserPlus aria-hidden />
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="tabular text-xs text-ink-3">{formatEnrollment(s.enrollmentNumber)}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </div>

        <ul aria-label={t.members} className="flex-1 divide-y divide-line overflow-y-auto px-4">
          {members === null ? null : members.length === 0 ? (
            <li className="py-6 text-center text-[13px] text-ink-3">{t.noMembers}</li>
          ) : (
            members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <StudentAvatar name={m.name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{m.name}</span>
                <span className="tabular text-xs text-ink-3">{formatEnrollment(m.enrollmentNumber)}</span>
                <Button variant="ghost" size="icon-sm" aria-label={t.remove(m.name)} disabled={pending} onClick={() => run(() => removeClassMember(cls.id, m.id))}>
                  <UserMinus aria-hidden />
                </Button>
              </li>
            ))
          )}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
