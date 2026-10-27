"use client";

import { ArrowDown, ArrowUp, Copy, MoreHorizontal, Plus, Trash2, Wand2 } from "lucide-react";
import { useState } from "react";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { duplicateSet, moveSet, newKey, pickPrescription, type DraftErrors, type ItemDraft, type SetDraft } from "../builder";
import { MAX_SETS, SET_TYPES, type SetType } from "../schemas";
import { BasicErrors, IntensityInput, LoadInputs, MoreToggle, PrescriptionMore, prescriptionExtras, QuantityRange, RestRange } from "./PrescriptionFields";

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

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-canvas p-3">
      <p className="text-xs text-ink-3">{t.sets.hint}</p>
      {sets.length > 0 && (
        <ol className="flex flex-col gap-3">
          {sets.map((s, i) => (
            <SetRow
              key={s.key}
              set={s}
              index={i}
              count={sets.length}
              errors={errors}
              readOnly={readOnly}
              onUpdate={(patch) => update(s.key, patch)}
              onReplace={onChange}
              sets={sets}
            />
          ))}
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

/** Uma série: tipo, quantidade, carga e pausa à vista; o resto em "Mais opções" (abre se já preenchido). */
function SetRow({
  set: s,
  index: i,
  count,
  sets,
  errors,
  readOnly,
  onUpdate,
  onReplace,
}: {
  set: SetDraft;
  index: number;
  count: number;
  sets: SetDraft[];
  errors: DraftErrors;
  readOnly: boolean;
  onUpdate: (patch: Partial<SetDraft>) => void;
  onReplace: (sets: SetDraft[]) => void;
}) {
  const id = (f: string) => `${s.key}-${f}`;
  const err = (f: string) => errors[`${s.key}.${f}`];
  const extras = prescriptionExtras(s) + (s.loadText.trim() ? 1 : 0);
  const [more, setMore] = useState(extras > 0);
  const moreOpen = more || ["qtyNote", "tempo"].some((f) => err(f));
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-2">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <span className="w-14 self-center text-xs font-semibold text-ink-2">{t.sets.number(i + 1)}</span>
        <label className="flex w-32 flex-col gap-1 text-[11px] text-ink-3" htmlFor={id("type")}>
          {t.sets.type}
          <Select value={s.setType} disabled={readOnly} onValueChange={(v) => onUpdate({ setType: v as SetType })}>
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
        <QuantityRange idPrefix={s.key} value={s} readOnly={readOnly} error={err} onChange={onUpdate} />
        <LoadInputs
          label={`${t.sets.number(i + 1)}: ${t.items.loadValue}`}
          value={s.loadValue}
          unit={s.loadUnit}
          readOnly={readOnly}
          invalid={!!err("loadValue")}
          onValue={(v) => onUpdate({ loadValue: v })}
          onUnit={(u) => onUpdate({ loadUnit: u })}
        />
        <IntensityInput idPrefix={s.key} value={s} readOnly={readOnly} error={err} onChange={onUpdate} />
        <RestRange idPrefix={s.key} value={s} readOnly={readOnly} error={err} onChange={onUpdate} />
        {!readOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={p.setMenu(i + 1)} className="ml-auto self-center">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={count >= MAX_SETS} onSelect={() => onReplace(duplicateSet(sets, s.key))}>
                <Copy aria-hidden />
                {p.duplicate}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={i === 0} onSelect={() => onReplace(moveSet(sets, s.key, -1))}>
                <ArrowUp aria-hidden />
                {p.moveUp}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={i === count - 1} onSelect={() => onReplace(moveSet(sets, s.key, 1))}>
                <ArrowDown aria-hidden />
                {p.moveDown}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => onReplace(sets.filter((x) => x.key !== s.key))}>
                <Trash2 aria-hidden />
                {p.remove}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {err("loadValue") && <span className="text-xs text-destructive">{err("loadValue")}</span>}
      <BasicErrors error={err} />
      <MoreToggle open={moreOpen} count={extras} controls={id("more")} label={t.more.set(i + 1)} onToggle={() => setMore(!moreOpen)} />
      {moreOpen && (
        <div id={id("more")} className="flex flex-col gap-2 border-l-2 border-line pl-3">
          <PrescriptionMore idPrefix={s.key} value={s} readOnly={readOnly} error={err} onChange={onUpdate} />
          <label className="flex max-w-56 flex-col gap-1 text-[11px] text-ink-3" htmlFor={id("text")}>
            {t.more.loadText}
            <Input id={id("text")} className="h-8 text-[13px]" value={s.loadText} disabled={readOnly} maxLength={40} onChange={(e) => onUpdate({ loadText: e.target.value })} />
          </label>
        </div>
      )}
    </li>
  );
}
