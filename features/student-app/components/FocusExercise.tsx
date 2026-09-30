"use client";

import { Check, ChevronLeft, ChevronRight, HeartHandshake, Pencil, Repeat2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTip } from "@/components/ui/RichTip";
import { messages } from "@/messages/pt-BR";
import { itemSummary, setTargets } from "../format";
import { currentExercise, currentSetIndex, doneSetText, type ItemState, type SetEntry } from "../session-state";
import type { AppItem } from "../types";
import { ExerciseThumb } from "./ExerciseThumb";
import { PainScale } from "./PainScale";

const t = messages.aluno.run;
const tp = messages.aluno.pain;

interface FocusExerciseProps {
  item: AppItem;
  index: number;
  total: number;
  state: ItemState;
  /** Modo restrito (professor sem acesso à saúde): nada de dor. */
  restricted: boolean;
  groupLabel: string | null;
  onEditSet: (setIndex: number, patch: Partial<SetEntry>) => void;
  onSetDone: (setIndex: number) => void;
  onSubstitute: (exerciseId: string | null) => void;
  onComplete: (pain: number | null) => void;
  onReopen: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}

/** Modo foco: um exercício por vez, série atual em destaque, séries feitas compactas com ✓. */
export function FocusExercise(props: FocusExerciseProps) {
  const { item, state, restricted } = props;
  const exercise = currentExercise(item, state);
  const targets = setTargets(item);
  const [editing, setEditing] = useState<number | null>(null);
  const current = editing ?? currentSetIndex(item, state);
  const painRequired = !restricted && item.ask_pain;
  const [pain, setPain] = useState<number | null>(state.pain);
  const [discomfort, setDiscomfort] = useState(state.pain !== null);
  const [showSubs, setShowSubs] = useState(false);
  const id = `ex-${item.id}`;

  return (
    <section id={id} aria-labelledby={`${id}-name`} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <header className="flex items-start gap-3">
        <ExerciseThumb key={exercise.id} exercise={exercise} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
            {t.of(props.index + 1, props.total)}
            {props.groupLabel && ` · ${props.groupLabel}`}
          </p>
          <h2 id={`${id}-name`} className="text-lg leading-snug font-semibold text-ink">
            {exercise.name}
          </h2>
          <p className="text-[13px] text-ink-3">{itemSummary(item)}</p>
        </div>
      </header>

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

      {item.substitutes.length > 0 && !state.completed && (
        <div className="flex flex-col gap-2">
          <Button type="button" variant="ghost" size="sm" className="-ml-2 w-fit" aria-expanded={showSubs} onClick={() => setShowSubs(!showSubs)}>
            <Repeat2 aria-hidden />
            {t.substitute}
          </Button>
          {showSubs && (
            <div className="flex flex-col gap-2 rounded-xl bg-canvas p-3 ring-1 ring-line">
              <p className="text-xs text-ink-3">{t.substituteHint}</p>
              <ul className="flex flex-col gap-2">
                {item.substitutes.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <ExerciseThumb exercise={s} size="sm" />
                    <Button
                      type="button"
                      size="sm"
                      variant={state.substituteId === s.id ? "default" : "outline"}
                      aria-pressed={state.substituteId === s.id}
                      className="flex-1 justify-start"
                      onClick={() => {
                        props.onSubstitute(s.id);
                        setShowSubs(false);
                      }}
                    >
                      {s.name}
                    </Button>
                  </li>
                ))}
              </ul>
              {state.substituteId && (
                <Button type="button" size="sm" variant="ghost" className="w-fit" onClick={() => props.onSubstitute(null)}>
                  {t.useMain(item.exercise.name)}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <ol className="flex flex-col gap-1.5" aria-label={exercise.name}>
        {targets.map((tg) => {
          const entry = state.sets[tg.index] ?? { qty: "", load: "", done: false };
          const setType = tg.setType === "work" ? null : messages.plans.sets.types[tg.setType];
          const targetText = [tg.quantity, tg.load, tg.intensity].filter(Boolean).join(" · ");

          if (tg.index === current && !state.completed) {
            const setId = `${id}-s${tg.index}`;
            return (
              <li key={tg.index} aria-current="step" className="rounded-xl bg-canvas p-3 ring-2 ring-ink/70">
                <p className="mb-2 text-[13px] text-ink-2">
                  <span className="font-semibold text-ink">{t.set(tg.index)}</span>
                  {setType && ` · ${setType}`}
                  {targetText && <span className="text-ink-3"> · {t.target}: {targetText}</span>}
                </p>
                <div className="flex items-end gap-2">
                  <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] text-ink-3" htmlFor={`${setId}-q`}>
                    {t.qty}
                    {tg.unitSuffix ? ` (${tg.unitSuffix})` : ""}
                    <Input id={`${setId}-q`} inputMode="decimal" value={entry.qty} onChange={(e) => props.onEditSet(tg.index, { qty: e.target.value })} className="h-12 text-lg" />
                  </label>
                  <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] text-ink-3" htmlFor={`${setId}-l`}>
                    {t.load} ({tg.defaultLoadUnit})
                    <Input id={`${setId}-l`} inputMode="decimal" value={entry.load} onChange={(e) => props.onEditSet(tg.index, { load: e.target.value })} className="h-12 text-lg" />
                  </label>
                  <Button
                    type="button"
                    size="lg"
                    aria-label={`${t.set(tg.index)}: ${t.done}`}
                    onClick={() => {
                      props.onSetDone(tg.index);
                      setEditing(null);
                    }}
                    className="h-12 shrink-0"
                  >
                    <Check aria-hidden />
                    {t.done}
                  </Button>
                </div>
              </li>
            );
          }

          if (entry.done) {
            return (
              <li key={tg.index} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 ring-1 ring-success-line">
                <span className="flex min-w-0 items-center gap-2 text-[13px] text-ink-2">
                  <Check aria-hidden className="size-4 shrink-0 text-success-ink" />
                  <span className="truncate">{t.doneLine(tg.index, doneSetText(tg.unitSuffix, entry, tg.defaultLoadUnit))}</span>
                </span>
                {!state.completed && (
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t.editSet(tg.index)} onClick={() => setEditing(tg.index)}>
                    <Pencil aria-hidden />
                  </Button>
                )}
              </li>
            );
          }

          return (
            <li key={tg.index} className="rounded-xl px-3 py-2 text-[13px] text-ink-3 ring-1 ring-line">
              {t.set(tg.index)}
              {setType && ` · ${setType}`}
              {targetText && ` · ${targetText}`}
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
          {!restricted &&
            (painRequired ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-[13px] font-semibold text-ink">
                  {tp.title} <span className="font-normal text-ink-3">· {tp.question}</span>
                </legend>
                <PainScale id={`${id}-pain`} value={pain} onChange={setPain} />
              </fieldset>
            ) : discomfort ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 flex w-full items-center justify-between text-[13px] font-semibold text-ink">
                  <span>
                    {tp.title} <span className="font-normal text-ink-3">· {tp.optional}</span>
                  </span>
                </legend>
                <PainScale id={`${id}-pain`} value={pain} onChange={setPain} />
                <button
                  type="button"
                  className="w-fit rounded text-xs text-ink-3 underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  onClick={() => {
                    setDiscomfort(false);
                    setPain(null);
                  }}
                >
                  {tp.hideDiscomfort}
                </button>
              </fieldset>
            ) : (
              <button
                type="button"
                className="w-fit rounded text-[13px] text-ink-3 underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                onClick={() => setDiscomfort(true)}
              >
                {tp.discomfort}
              </button>
            ))}
          <Button
            type="button"
            size="lg"
            variant={current === null ? "default" : "outline"}
            className="h-12 w-full text-base"
            disabled={painRequired && pain === null}
            onClick={() => props.onComplete(restricted ? null : pain)}
          >
            {t.completeExercise}
          </Button>
          {painRequired && pain === null && <p className="-mt-1 text-center text-xs text-ink-3">{tp.required}</p>}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-line pt-3">
        <Button type="button" variant="ghost" size="sm" disabled={!props.onPrev} onClick={props.onPrev ?? undefined}>
          <ChevronLeft aria-hidden />
          {t.prev}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={!props.onNext} onClick={props.onNext ?? undefined}>
          {t.next}
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </section>
  );
}
