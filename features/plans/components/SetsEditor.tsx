"use client";

import { Plus, Trash2, Wand2 } from "lucide-react";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { newKey, type ItemDraft, type SetDraft, type DraftErrors } from "../builder";
import { LOAD_UNITS, MAX_SETS, SET_TYPES, type LoadUnit, type SetType } from "../schemas";

const t = messages.plans;

interface Props {
  item: ItemDraft;
  errors: DraftErrors;
  readOnly: boolean;
  onChange: (sets: SetDraft[]) => void;
  onGenerate: () => void;
}

export function SetsEditor({ item, errors, readOnly, onChange, onGenerate }: Props) {
  const update = (key: string, patch: Partial<SetDraft>) => onChange(item.setsDetail.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const small = "h-8 text-[13px]";

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-canvas p-3">
      <p className="text-xs text-ink-3">{t.sets.hint}</p>
      {item.setsDetail.length > 0 && (
        <ol className="flex flex-col gap-2">
          {item.setsDetail.map((s, i) => {
            const err = (f: string) => errors[`${s.key}.${f}`];
            const id = (f: string) => `${s.key}-${f}`;
            return (
              <li key={s.key} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[4.5rem_8rem_5rem_9rem_1fr_5rem_auto]">
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
                <label className="flex flex-col gap-1 text-[11px] text-ink-3" htmlFor={id("reps")}>
                  {t.items.reps}
                  <Input id={id("reps")} className={small} value={s.reps} disabled={readOnly} maxLength={20} aria-invalid={!!err("reps")} onChange={(e) => update(s.key, { reps: e.target.value })} />
                </label>
                <div className="flex flex-col gap-1 text-[11px] text-ink-3">
                  <span id={id("load-label")}>{t.items.load}</span>
                  <div className="flex gap-1" role="group" aria-labelledby={id("load-label")}>
                    <Input
                      aria-label={t.items.loadValue}
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
                <label className="flex flex-col gap-1 text-[11px] text-ink-3" htmlFor={id("rest")}>
                  {t.items.rest}
                  <Input id={id("rest")} inputMode="numeric" className={small} value={s.rest} disabled={readOnly} aria-invalid={!!err("rest")} onChange={(e) => update(s.key, { rest: e.target.value })} />
                </label>
                {!readOnly && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${t.sets.remove} ${i + 1}`}
                    className="justify-self-end hover:text-danger"
                    onClick={() => onChange(item.setsDetail.filter((x) => x.key !== s.key))}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                )}
                {["reps", "loadValue", "rest"].map((f) =>
                  err(f) ? (
                    <p key={f} className="col-span-full text-xs text-destructive">
                      {t.sets.number(i + 1)}: {err(f)}
                    </p>
                  ) : null,
                )}
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
            disabled={item.setsDetail.length >= MAX_SETS}
            onClick={() => {
              const last = item.setsDetail.at(-1);
              onChange([
                ...item.setsDetail,
                last ? { ...last, key: newKey() } : { key: newKey(), setType: "work", reps: item.reps, loadValue: item.loadValue, loadUnit: item.loadUnit, loadText: item.loadText, rest: item.rest },
              ]);
            }}
          >
            <Plus aria-hidden />
            {t.sets.add}
          </Button>
          {item.setsDetail.length === 0 && (
            <Button type="button" variant="outline" size="sm" onClick={onGenerate}>
              <Wand2 aria-hidden />
              {t.sets.generate}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
