"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listImportSources, loadImportSource, type ImportSource } from "../actions";
import { fromSaved, groupLabel, toBlocks, type ItemDraft, type WorkoutDraft } from "../builder";

const t = messages.plans.importItems;

interface Props {
  planId: string | null;
  studentId: string | null;
  /** Divisões do rascunho atual (a de destino fica de fora). */
  workouts: WorkoutDraft[];
  targetKey: string;
  onClose: () => void;
  onImport: (items: ItemDraft[]) => void;
}

/** Copia itens de outra divisão, de outro plano do aluno ou de um modelo (mantém grupos e séries). */
export function ImportItemsDialog({ planId, studentId, workouts, targetKey, onClose, onImport }: Props) {
  const [sources, setSources] = useState<ImportSource[]>([]);
  const [source, setSource] = useState<string>("");
  const [loaded, setLoaded] = useState<WorkoutDraft[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => setSources(await listImportSources(studentId, planId)));
  }, [studentId, planId]);

  const localOptions = workouts.filter((w) => w.key !== targetKey && w.items.length > 0);
  const choose = (value: string) => {
    setSource(value);
    setSelected(new Set());
    if (value.startsWith("local:")) {
      setLoaded(workouts.filter((w) => w.key === value.slice(6)));
      return;
    }
    setLoaded(null);
    startTransition(async () => {
      const plan = await loadImportSource(value.slice(5));
      setLoaded(plan ? fromSaved(plan).workouts.filter((w) => w.items.length > 0) : []);
    });
  };

  const all = useMemo(() => loaded?.flatMap((w) => w.items) ?? [], [loaded]);
  const toggle = (keys: string[], on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });

  const planSources = sources.filter((s) => s.kind === "student");
  const templateSources = sources.filter((s) => s.kind === "template");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-line px-5 py-4">
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.hint}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 overflow-y-auto px-5 py-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            {t.source}
            <Select value={source} onValueChange={choose}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t.sourcePlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {localOptions.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>{t.thisPlan}</SelectLabel>
                    {localOptions.map((w) => (
                      <SelectItem key={w.key} value={`local:${w.key}`}>
                        {t.division(w.label, w.name)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {planSources.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>{t.studentPlans}</SelectLabel>
                    {planSources.map((s) => (
                      <SelectItem key={s.id} value={`plan:${s.id}`}>
                        {s.name} · {messages.plans.status[s.status as keyof typeof messages.plans.status] ?? s.status}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {templateSources.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>{t.templates}</SelectLabel>
                    {templateSources.map((s) => (
                      <SelectItem key={s.id} value={`plan:${s.id}`}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </label>

          {pending && !loaded && source && <p className="text-[13px] text-ink-3">{messages.plans.picker.loading}</p>}
          {loaded?.length === 0 && <p className="text-[13px] text-ink-3">{t.empty}</p>}
          {loaded?.map((w) => {
            const keys = w.items.map((i) => i.key);
            const allOn = keys.every((k) => selected.has(k));
            return (
              <fieldset key={w.key} className="flex flex-col gap-1.5 rounded-xl border border-line p-3">
                <legend className="px-1 text-[13px] font-semibold text-ink">{t.division(w.label, w.name)}</legend>
                <label className="flex items-center gap-2 text-[12px] text-ink-2">
                  <Checkbox checked={allOn} onCheckedChange={(v) => toggle(keys, v === true)} />
                  {t.selectAll}
                </label>
                <ul className="flex flex-col gap-1">
                  {toBlocks(w.items).map((b) =>
                    b.items.map((it, i) => (
                      <li key={it.key}>
                        <label className="flex items-center gap-2 text-[13px] text-ink">
                          <Checkbox checked={selected.has(it.key)} onCheckedChange={(v) => toggle([it.key], v === true)} />
                          {it.exerciseName}
                          {b.groupKey && i === 0 && <span className="rounded-full bg-brand-100 px-1.5 text-[10px] font-semibold text-brand-800">{groupLabel(b.items.length)}</span>}
                          {it.setsDetail.length > 0 && <span className="text-[11px] text-ink-3">{messages.plans.sets.show(it.setsDetail.length)}</span>}
                        </label>
                      </li>
                    )),
                  )}
                </ul>
              </fieldset>
            );
          })}
        </div>
        <DialogFooter className="border-t border-line px-5 py-3">
          <Button variant="ghost" onClick={onClose}>
            {messages.plans.manage.cancel}
          </Button>
          <Button disabled={selected.size === 0} onClick={() => onImport(all.filter((i) => selected.has(i.key)))}>
            {t.confirm(selected.size)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
