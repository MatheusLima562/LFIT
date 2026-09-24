"use client";

import { ArrowDown, ArrowUp, ChevronDown, GripVertical, Replace, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { messages } from "@/messages/pt-BR";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LevelBadge } from "@/features/exercises/components/LevelBadge";
import type { StudentRule } from "../queries";
import type { DraftErrors, ItemDraft, SetDraft } from "../builder";
import { LOAD_UNITS, type LoadUnit } from "../schemas";
import { SetsEditor } from "./SetsEditor";

const t = messages.plans;

export interface ItemCardProps {
  item: ItemDraft;
  index: number;
  errors: DraftErrors;
  rules: StudentRule[];
  readOnly: boolean;
  selected: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  dragHandle?: ReactNode;
  onSelect: (value: boolean) => void;
  onChange: (patch: Partial<ItemDraft>) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  onSwap: () => void;
  onGenerateSets: () => void;
}

export function ItemCard(props: ItemCardProps) {
  const { item, index, errors, rules, readOnly, selected, canMoveUp, canMoveDown, dragHandle } = props;
  const [expanded, setExpanded] = useState(item.setsDetail.length > 0);
  const err = (f: string) => errors[`${item.key}.${f}`];
  const id = (f: string) => `${item.key}-${f}`;
  const small = "h-8 text-[13px]";
  const hasDetail = item.setsDetail.length > 0;
  const setErrors = item.setsDetail.some((s) => Object.keys(errors).some((k) => k.startsWith(`${s.key}.`)));

  const field = (f: keyof ItemDraft, label: string, opts: { placeholder?: string; inputMode?: "numeric" | "decimal" | "text"; maxLength?: number; className?: string } = {}) => (
    <label className={cn("flex min-w-0 flex-col gap-1 text-[11px] text-ink-3", opts.className)} htmlFor={id(f)}>
      {label}
      <Input
        id={id(f)}
        className={small}
        value={item[f] as string}
        placeholder={opts.placeholder}
        inputMode={opts.inputMode}
        maxLength={opts.maxLength}
        disabled={readOnly}
        aria-invalid={!!err(f)}
        aria-describedby={err(f) ? id(`${f}-err`) : undefined}
        onChange={(e) => props.onChange({ [f]: e.target.value } as Partial<ItemDraft>)}
      />
      {err(f) && (
        <span id={id(`${f}-err`)} className="text-xs text-destructive">
          {err(f)}
        </span>
      )}
    </label>
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-surface p-3",
        rules.some((r) => r.level === "avoid") ? "border-red-300" : rules.length ? "border-amber-300" : "border-line",
        selected && "ring-2 ring-brand-300",
      )}
    >
      <div className="flex items-start gap-2">
        {dragHandle}
        {!readOnly && (
          <Checkbox
            className="mt-1"
            checked={selected}
            onCheckedChange={(v) => props.onSelect(v === true)}
            aria-label={t.items.select(item.exerciseName)}
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-ink">
            <span className="tabular mr-1 text-ink-3">{index + 1}.</span>
            {item.exerciseName}
          </p>
          {rules.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-1" aria-label={t.alerts.title}>
              {rules.map((r, i) => (
                <li key={i} className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-2">
                  <LevelBadge level={r.level} />
                  <span>
                    {r.restricted ? (
                      t.alerts.restricted
                    ) : (
                      <>
                        {r.note ? `${r.note} · ` : ""}
                        {r.conditionName} ({r.groupName})
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {!readOnly && (
          <div className="flex shrink-0 items-center">
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`${t.items.moveUp}: ${item.exerciseName}`} disabled={!canMoveUp} onClick={() => props.onMove(-1)}>
              <ArrowUp aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`${t.items.moveDown}: ${item.exerciseName}`} disabled={!canMoveDown} onClick={() => props.onMove(1)}>
              <ArrowDown aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`${t.items.swap}: ${item.exerciseName}`} title={t.items.swap} onClick={props.onSwap}>
              <Replace aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`${t.items.remove}: ${item.exerciseName}`} className="hover:text-danger" onClick={props.onRemove}>
              <Trash2 aria-hidden />
            </Button>
          </div>
        )}
      </div>

      <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-[4.5rem_6rem_minmax(9rem,1fr)_minmax(7rem,1fr)_6rem_5.5rem_5rem]", hasDetail && "opacity-60")}>
        {field("sets", t.items.sets, { inputMode: "numeric" })}
        {field("reps", t.items.reps, { placeholder: t.items.repsPlaceholder, maxLength: 20 })}
        <div className="flex min-w-0 flex-col gap-1 text-[11px] text-ink-3">
          <span id={id("load-label")}>{t.items.load}</span>
          <div className="flex gap-1" role="group" aria-labelledby={id("load-label")}>
            <Input
              aria-label={`${t.items.load}: ${t.items.loadValue}`}
              inputMode="decimal"
              className={cn(small, "min-w-0")}
              value={item.loadValue}
              disabled={readOnly}
              aria-invalid={!!err("loadValue")}
              onChange={(e) => props.onChange({ loadValue: e.target.value })}
            />
            <Select value={item.loadUnit} disabled={readOnly} onValueChange={(v) => props.onChange({ loadUnit: v as LoadUnit })}>
              <SelectTrigger aria-label={t.items.loadUnit} className="w-16 shrink-0 text-[13px] data-[size=default]:h-8">
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
          {err("loadValue") && <span className="text-xs text-destructive">{err("loadValue")}</span>}
        </div>
        {field("loadText", t.items.loadText, { maxLength: 40 })}
        {field("rest", t.items.rest, { inputMode: "numeric" })}
        {field("tempo", t.items.tempo, { placeholder: t.items.tempoPlaceholder, maxLength: 4 })}
        {field("rpe", t.items.rpe, { inputMode: "decimal" })}
      </div>
      {field("notes", t.items.notes, { maxLength: 300 })}

      {(!readOnly || hasDetail) && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={id("sets")}
            onClick={() => setExpanded(!expanded)}
            className={cn(
              "inline-flex w-fit items-center gap-1 rounded text-[13px] font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50",
              setErrors ? "text-destructive" : "text-brand-700",
            )}
          >
            <ChevronDown aria-hidden className={cn("size-4 transition-transform", expanded && "rotate-180")} />
            {t.sets.show(item.setsDetail.length)}
          </button>
          {expanded && (
            <div id={id("sets")}>
              <SetsEditor
                item={item}
                errors={errors}
                readOnly={readOnly}
                onChange={(sets: SetDraft[]) => props.onChange({ setsDetail: sets })}
                onGenerate={props.onGenerateSets}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DragHandle({ label, listeners, attributes }: { label: string; listeners?: Record<string, unknown>; attributes?: Record<string, unknown> }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="mt-0.5 grid size-7 shrink-0 cursor-grab touch-none place-items-center rounded-md text-ink-3 outline-none hover:bg-canvas hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50 active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <GripVertical aria-hidden className="size-4" />
    </button>
  );
}
