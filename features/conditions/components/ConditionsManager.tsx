"use client";

import Link from "next/link";
import { Archive, ArchiveRestore, BookOpen, Dumbbell, HeartPulse, Lock, Pencil, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveCondition, setConditionArchived } from "../actions";
import type { ConditionRow } from "../queries";
import { matchesCondition } from "../regions";

const t = messages.conditions;

export function ConditionsManager({ conditions, isOwner }: { conditions: ConditionRow[]; isOwner: boolean }) {
  const [editing, setEditing] = useState<ConditionRow | "new" | null>(null);
  const [archiving, setArchiving] = useState<ConditionRow | null>(null);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");

  const regions = conditions.filter((c) => c.isGlobal && !c.parentId);
  const visible = conditions.filter((c) => matchesCondition(c, query, conditions));
  const global = visible.filter((c) => c.isGlobal);
  const own = visible.filter((c) => !c.isGlobal && !c.archived);
  const archived = visible.filter((c) => !c.isGlobal && c.archived);

  const toggle = (c: ConditionRow, value: boolean) =>
    startTransition(async () => {
      const r = await setConditionArchived(c.id, value);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      setArchiving(null);
    });

  const card = (c: ConditionRow) => (
    <li key={c.id} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <span aria-hidden className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-canvas text-ink-3">
        {c.isGlobal ? <Lock className="size-4" /> : <HeartPulse className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        {c.parentName && <p className="text-xs text-ink-3">{t.regionOf(c.parentName)}</p>}
        <p className="text-[14px] font-semibold text-ink">{c.name}</p>
        {c.description && <p className="mt-0.5 text-[13px] text-ink-2">{c.description}</p>}
        {c.searchTerms.length > 0 && <p className="mt-0.5 text-xs text-ink-3">{t.synonyms(c.searchTerms.join(", "))}</p>}
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
          <Link
            href={`/treinos/exercicios?condicao=${c.id}`}
            title={t.exercisesHint}
            className="inline-flex items-center gap-1 rounded text-brand-700 hover:underline"
          >
            <Dumbbell aria-hidden className="size-3.5" />
            {t.exercises(c.exercises)}
          </Link>
          <span className="text-ink-3">{t.groups(c.groups)}</span>
          {c.guideKey && (
            <Link
              href={`/treinos/condicoes/guia/${c.guideKey}`}
              aria-label={messages.guides.openFor(c.name)}
              className="inline-flex items-center gap-1 rounded text-brand-700 hover:underline"
            >
              <BookOpen aria-hidden className="size-3.5" />
              {messages.guides.open}
            </Link>
          )}
        </p>
      </div>
      {!c.isGlobal && !c.archived && (
        <Button variant="ghost" size="icon-sm" aria-label={`${t.edit}: ${c.name}`} onClick={() => setEditing(c)}>
          <Pencil aria-hidden />
        </Button>
      )}
      {!c.isGlobal && isOwner && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${c.archived ? t.unarchive : t.archive}: ${c.name}`}
          disabled={pending}
          onClick={() => (c.archived ? toggle(c, false) : setArchiving(c))}
        >
          {c.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
        </Button>
      )}
    </li>
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex max-w-sm flex-col gap-1.5">
        <label htmlFor="conditions-filter" className="text-sm font-medium text-ink">{t.filter}</label>
        <Input id="conditions-filter" type="search" value={query} placeholder={t.filterPlaceholder} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">{t.ownTitle}</h2>
            <p className="text-[13px] text-ink-2">{t.ownHint}</p>
          </div>
          <Button onClick={() => setEditing("new")}>
            <Plus aria-hidden />
            {t.new}
          </Button>
        </div>
        {own.length === 0 ? (
          <EmptyState icon={<HeartPulse />} message={t.emptyOwn} className="min-h-32 bg-surface" />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{own.map(card)}</ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">{t.globalTitle}</h2>
          <p className="text-[13px] text-ink-2">{t.globalHint}</p>
        </div>
        {global.length === 0 ? (
          <p className="text-[13px] text-ink-3">{t.filterEmpty}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{global.map(card)}</ul>
        )}
      </section>

      {archived.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-ink">{t.archivedTitle}</h2>
          <ul className="grid gap-3 opacity-80 sm:grid-cols-2 xl:grid-cols-3">{archived.map(card)}</ul>
        </section>
      )}

      {editing && <ConditionDialog condition={editing === "new" ? null : editing} regions={regions} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(open) => !open && setArchiving(null)}
        title={t.archiveTitle}
        description={archiving ? t.archiveText(archiving.name) : ""}
        confirmLabel={t.archive}
        cancelLabel={messages.students.confirm.cancel}
        pending={pending}
        onConfirm={() => archiving && toggle(archiving, true)}
      />
    </div>
  );
}

function ConditionDialog({ condition, regions, onClose }: { condition: ConditionRow | null; regions: ConditionRow[]; onClose: () => void }) {
  const [name, setName] = useState(condition?.name ?? "");
  const [description, setDescription] = useState(condition?.description ?? "");
  const [parentId, setParentId] = useState(condition?.parentId ?? "");
  const [searchTerms, setSearchTerms] = useState(condition?.searchTerms.join(", ") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{condition ? t.edit : t.new}</DialogTitle>
          <DialogDescription>{t.ownHint}</DialogDescription>
        </DialogHeader>
        <form
          id="condition-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const r = await saveCondition({ name, description, parentId, searchTerms }, condition?.id);
              if (!r.ok) return setError(r.error);
              toast.success(r.message);
              onClose();
            });
          }}
        >
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="condition-name">{t.name}</FieldLabel>
            <Input id="condition-name" value={name} maxLength={80} placeholder={t.namePlaceholder} aria-invalid={!!error} onChange={(e) => setName(e.target.value)} autoFocus />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="condition-description">{t.description}</FieldLabel>
            <Textarea id="condition-description" rows={3} maxLength={300} value={description} placeholder={t.descriptionPlaceholder} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="condition-region">{t.region}</FieldLabel>
            <Select value={parentId || "none"} onValueChange={(v) => setParentId(v === "none" ? "" : v)}>
              <SelectTrigger id="condition-region" className="w-full" aria-describedby="condition-region-hint">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t.regionNone}</SelectItem>
                {regions.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id="condition-region-hint" className="text-xs text-ink-3">{t.regionHint}</p>
          </Field>
          <Field>
            <FieldLabel htmlFor="condition-terms">{t.searchTerms}</FieldLabel>
            <Input id="condition-terms" value={searchTerms} maxLength={700} placeholder={t.searchTermsPlaceholder} aria-describedby="condition-terms-hint" onChange={(e) => setSearchTerms(e.target.value)} />
            <p id="condition-terms-hint" className="text-xs text-ink-3">{t.searchTermsHint}</p>
          </Field>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {messages.students.confirm.cancel}
          </Button>
          <Button type="submit" form="condition-form" disabled={pending || name.trim().length < 2}>
            {condition ? t.save : t.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
