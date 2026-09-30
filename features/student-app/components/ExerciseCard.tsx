"use client";

import { Check, ChevronDown, HeartHandshake, Repeat2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTip } from "@/components/ui/RichTip";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { itemSummary, setTargets } from "../format";
import { currentExercise, type ItemState, type SetEntry } from "../session-state";
import type { AppItem } from "../types";
import { ExerciseMedia } from "./ExerciseMedia";
import { PainScale } from "./PainScale";

const t = messages.aluno.run;
const tp = messages.aluno.pain;

interface ExerciseCardProps {
  item: AppItem;
  index: number;
  state: ItemState;
  /** Modo restrito (professor sem acesso à saúde): nada de dor. */
  restricted: boolean;
  open: boolean;
  groupLabel: string | null;
  onToggle: () => void;
  onEditSet: (setIndex: number, patch: Partial<SetEntry>) => void;
  onSetDone: (setIndex: number) => void;
  onSubstitute: (exerciseId: string | null) => void;
  onComplete: (pain: number | null) => void;
  onReopen: () => void;
}

export function ExerciseCard(props: ExerciseCardProps) {
  const { item, index, state, restricted, open } = props;
  const exercise = currentExercise(item, state);
  const targets = setTargets(item);
  const doneSets = targets.filter((tg) => state.sets[tg.index]?.done).length;
  const painRequired = !restricted && Boolean(item.care_note);
  const [pain, setPain] = useState<number | null>(state.pain);
  const [showSubs, setShowSubs] = useState(false);
  const id = `ex-${item.id}`;

  return (
    <li
      id={id}
      className={cn(
        "scroll-mt-20 rounded-2xl border bg-surface shadow-card",
        state.completed ? "border-line opacity-80" : open ? "border-ink/20" : "border-line",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-body`}
        onClick={props.onToggle}
        className="flex w-full items-start gap-3 rounded-2xl p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span
          aria-hidden
          className={cn(
            "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold",
            state.completed ? "bg-success-soft text-success-ink ring-1 ring-success-line" : "bg-canvas text-ink-2 ring-1 ring-line",
          )}
        >
          {state.completed ? <Check className="size-4" /> : index + 1}
        </span>
        <span className="min-w-0 flex-1">
          {props.groupLabel && <span className="mb-0.5 block text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{props.groupLabel}</span>}
          <span className="block text-[15px] font-semibold text-ink">{exercise.name}</span>
          <span className="block text-xs text-ink-3">
            {itemSummary(item)}
            {!state.completed && doneSets > 0 && ` · ${doneSets}/${targets.length}`}
          </span>
        </span>
        <ChevronDown aria-hidden className={cn("mt-1 size-5 shrink-0 text-ink-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div id={`${id}-body`} className="flex flex-col gap-4 border-t border-line px-4 pt-3 pb-4">
          {item.care_note && (
            <div className="flex gap-2.5 rounded-xl bg-canvas px-3 py-2.5 ring-1 ring-line">
              <HeartHandshake aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" />
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{t.careTitle}</p>
                <p className="text-[13px] text-ink">{item.care_note}</p>
              </div>
            </div>
          )}
          {item.tip && (
            <div className="text-[13px] text-ink-2">
              <p className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{t.tip}</p>
              <RichTip text={item.tip} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <ExerciseMedia key={exercise.id} exercise={exercise} />
            {item.substitutes.length > 0 && !state.completed && (
              <Button type="button" variant="ghost" size="sm" aria-expanded={showSubs} onClick={() => setShowSubs(!showSubs)}>
                <Repeat2 aria-hidden />
                {t.substitute}
              </Button>
            )}
          </div>
          {showSubs && (
            <div className="flex flex-col gap-2 rounded-xl bg-canvas p-3 ring-1 ring-line">
              <p className="text-xs text-ink-3">{t.substituteHint}</p>
              <div className="flex flex-wrap gap-2">
                {item.substitutes.map((s) => (
                  <Button
                    key={s.id}
                    type="button"
                    size="sm"
                    variant={state.substituteId === s.id ? "default" : "outline"}
                    aria-pressed={state.substituteId === s.id}
                    onClick={() => {
                      props.onSubstitute(s.id);
                      setShowSubs(false);
                    }}
                  >
                    {s.name}
                  </Button>
                ))}
                {state.substituteId && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => props.onSubstitute(null)}>
                    {t.useMain(item.exercise.name)}
                  </Button>
                )}
              </div>
            </div>
          )}

          <ol className="flex flex-col gap-2" aria-label={exercise.name}>
            {targets.map((tg) => {
              const entry = state.sets[tg.index] ?? { qty: "", load: "", done: false };
              const setId = `${id}-s${tg.index}`;
              const setType = tg.setType === "work" ? null : messages.plans.sets.types[tg.setType];
              return (
                <li key={tg.index} className={cn("rounded-xl p-2.5 ring-1", entry.done ? "bg-success-soft/40 ring-success-line" : "bg-canvas ring-line")}>
                  <p className="mb-2 text-[12px] text-ink-2">
                    <span className="font-semibold text-ink">{t.set(tg.index)}</span>
                    {setType && ` · ${setType}`}
                    {[tg.quantity, tg.load, tg.intensity].filter(Boolean).length > 0 && (
                      <span className="text-ink-3"> · {t.target}: {[tg.quantity, tg.load, tg.intensity].filter(Boolean).join(" · ")}</span>
                    )}
                  </p>
                  <div className="flex items-end gap-2">
                    <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] text-ink-3" htmlFor={`${setId}-q`}>
                      {t.qty}
                      {tg.unitSuffix ? ` (${tg.unitSuffix})` : ""}
                      <Input
                        id={`${setId}-q`}
                        inputMode="decimal"
                        value={entry.qty}
                        disabled={state.completed}
                        onChange={(e) => props.onEditSet(tg.index, { qty: e.target.value })}
                        className="h-11 text-base"
                      />
                    </label>
                    <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] text-ink-3" htmlFor={`${setId}-l`}>
                      {t.load} ({tg.defaultLoadUnit})
                      <Input
                        id={`${setId}-l`}
                        inputMode="decimal"
                        value={entry.load}
                        disabled={state.completed}
                        onChange={(e) => props.onEditSet(tg.index, { load: e.target.value })}
                        className="h-11 text-base"
                      />
                    </label>
                    <Button
                      type="button"
                      size="lg"
                      variant={entry.done ? "outline" : "default"}
                      disabled={state.completed}
                      aria-label={`${t.set(tg.index)}: ${t.done}`}
                      onClick={() => props.onSetDone(tg.index)}
                      className="h-11 shrink-0"
                    >
                      <Check aria-hidden />
                      {t.done}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>

          {state.completed ? (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-canvas px-3 py-2.5 ring-1 ring-line">
              <p className="text-[13px] text-ink-2">
                {t.exerciseDone}
                {!restricted && state.pain !== null && ` · ${tp.scale(state.pain)}`}
              </p>
              <Button type="button" variant="ghost" size="sm" onClick={props.onReopen}>
                {t.reopen}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {!restricted && (
                <fieldset className="flex flex-col gap-2">
                  <legend id={`${id}-pain-label`} className="text-[13px] font-semibold text-ink">
                    {tp.title} <span className="font-normal text-ink-3">· {painRequired ? tp.question : tp.optional}</span>
                  </legend>
                  <PainScale id={`${id}-pain`} value={pain} onChange={setPain} />
                </fieldset>
              )}
              <Button type="button" size="lg" className="h-12 w-full text-base" disabled={painRequired && pain === null} onClick={() => props.onComplete(restricted ? null : pain)}>
                {t.completeExercise}
              </Button>
              {painRequired && pain === null && <p className="-mt-1 text-center text-xs text-ink-3">{tp.required}</p>}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
