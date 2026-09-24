"use client";

import { ArrowDown, ArrowUp, Copy, MoreHorizontal, Plus, Trash2, Wand2 } from "lucide-react";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { duplicateSet, moveSet, newKey, pickPrescription, type DraftErrors, type ItemDraft, type SetDraft } from "../builder";
import { LOAD_UNITS, MAX_SETS, SET_TYPES, type LoadUnit, type SetType } from "../schemas";
import { PrescriptionFields } from "./PrescriptionFields";

const t = messages.plans;
const p = messages.plans.prescription;

interface Props {
  item: ItemDraft;
  errors: DraftErrors;
  readOnly: boolean;
  onChange: (sets: SetDraft[]) => void;
  onGenerate: () => void;
}

export function SetsEditor({ item, errors, readOnly, onChange, onGenerate }: Props) {
  const sets = item.setsDetail;
  const update = (key: string, patch: Partial<SetDraft>) => onChange(sets.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const small = "h-8 text-[13px]";

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-canvas p-3">
      <p className="text-xs text-ink-3">{t.sets.hint}</p>
      {sets.length > 0 && (
        <ol className="flex flex-col gap-3">
          {sets.map((s, i) => {
            const id = (f: string) => `${s.key}-${f}`;
            const err = (f: string) => errors[`${s.key}.${f}`];
            return (
              <li key={s.key} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-2">
                <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[4.5rem_8rem_minmax(8rem,12rem)_minmax(7rem,12rem)_auto]">
                  <span className="col-span-2 self-center text-xs font-semibold text-ink-2 sm:col-span-1">{t.sets.number(i + 1)}</span>
                  <label className="flex flex-col gap-1 text-[11px] text-ink-3" htmlFor={id("type")}>
                    {t.sets.type}
                    <Select value={s.setType} disabled={readOnly} onValueChange={(v) => update(s.key, { setType: v as SetType })}>
                      <SelectTrigger id={id("type")} className="w-full text-[13px] data-[size=default]:h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SET_TYPES.map((st) => (
                          <SelectItem key={st} value={st}>
                            {t.sets.types[st]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <div className="flex flex-col gap-1 text-[11px] text-ink-3">
                    <span id={id("load-label")}>{t.items.load}</span>
                    <div className="flex gap-1" role="group" aria-labelledby={id("load-label")}>
                      <Input
                        aria-label={`${t.sets.number(i + 1)}: ${t.items.loadValue}`}
                        inputMode="decimal"
                        className={cn(small, "min-w-0")}
                        value={s.loadValue}
                        disabled={readOnly}
                        aria-invalid={!!err("loadValue")}
                        onChange={(e) => update(s.key, { loadValue: e.target.value })}
                      />
                      <Select value={s.loadUnit} disabled={readOnly} onValueChange={(v) => update(s.key, { loadUnit: v as LoadUnit })}>
                        <SelectTrigger aria-label={t.items.loadUnit} className="w-16 text-[13px] data-[size=default]:h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LOAD_UNITS.map((u) => (
                            <SelectItem key={u} value={u}>
                              {u}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <label className="flex flex-col gap-1 text-[11px] text-ink-3" htmlFor={id("text")}>
                    {t.items.loadText}
                    <Input id={id("text")} className={small} value={s.loadText} disabled={readOnly} maxLength={40} onChange={(e) => update(s.key, { loadText: e.target.value })} />
                  </label>
                  {!readOnly && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={p.setMenu(i + 1)} className="justify-self-end">
                          <MoreHorizontal aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem disabled={sets.length >= MAX_SETS} onSelect={() => onChange(duplicateSet(sets, s.key))}>
                          <Copy aria-hidden />
                          {p.duplicate}
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={i === 0} onSelect={() => onChange(moveSet(sets, s.key, -1))}>
                          <ArrowUp aria-hidden />
                          {p.moveUp}
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={i === sets.length - 1} onSelect={() => onChange(moveSet(sets, s.key, 1))}>
                          <ArrowDown aria-hidden />
                          {p.moveDown}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => onChange(sets.filter((x) => x.key !== s.key))}>
                          <Trash2 aria-hidden />
                          {p.remove}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                {err("loadValue") && <span className="text-xs text-destructive">{err("loadValue")}</span>}
                <PrescriptionFields idPrefix={s.key} value={s} readOnly={readOnly} error={err} onChange={(patch) => update(s.key, patch)} />
              </li>
            );
          })}
        </ol>
      )}
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={sets.length >= MAX_SETS}
            onClick={() => {
              const last = sets.at(-1);
              onChange([
                ...sets,
                last
                  ? { ...last, key: newKey() }
                  : { key: newKey(), setType: "work", ...pickPrescription(item), loadValue: item.loadValue, loadUnit: item.loadUnit, loadText: item.loadText },
              ]);
            }}
          >
            <Plus aria-hidden />
            {t.sets.add}
          </Button>
          {sets.length === 0 && (
            <Button type="button" variant="outline" size="sm" onClick={onGenerate}>
              <Wand2 aria-hidden />
              {t.sets.generate}
            </Button>
          )}
          {sets.length >= MAX_SETS && <span className="self-center text-xs text-ink-3">{t.sets.max}</span>}
        </div>
      )}
    </div>
  );
}
