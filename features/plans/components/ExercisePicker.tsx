"use client";

import { Plus, Search } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { messages } from "@/messages/pt-BR";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LevelBadge } from "@/features/exercises/components/LevelBadge";
import { MUSCLE_GROUPS } from "@/features/exercises/constants";
import { searchExercises, type PickerExercise } from "../actions";
import type { StudentRule } from "../queries";

const t = messages.plans.picker;
const ALL = "all";

interface Props {
  open: boolean;
  mode: "add" | "swap";
  workoutLabel: string;
  rules: StudentRule[];
  onOpenChange: (open: boolean) => void;
  onPick: (exercise: PickerExercise) => void;
}

/** Painel lateral com busca na biblioteca; mostra o alerta do aluno antes de escolher. */
export function ExercisePicker({ open, mode, workoutLabel, rules, onOpenChange, onPick }: Props) {
  const [q, setQ] = useState("");
  const [grupo, setGrupo] = useState<string>(ALL);
  const [rows, setRows] = useState<PickerExercise[]>([]);
  const [loading, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(
      () => startTransition(async () => setRows(await searchExercises(q, grupo === ALL ? null : grupo))),
      q ? 250 : 0,
    );
    return () => clearTimeout(timer);
  }, [open, q, grupo]);

  const worst = (exerciseId: string) => {
    const r = rules.filter((x) => x.exerciseId === exerciseId);
    return r.some((x) => x.level === "avoid") ? "avoid" : r.length ? "caution" : null;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-line">
          <SheetTitle>{mode === "swap" ? t.swapTitle : t.title}</SheetTitle>
          <SheetDescription>{`${messages.plans.workouts.label}: ${workoutLabel}`}</SheetDescription>
          <div className="mt-3 flex flex-col gap-2">
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
              <Input type="search" aria-label={t.search} placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" autoFocus />
            </div>
            <Select value={grupo} onValueChange={setGrupo}>
              <SelectTrigger aria-label={messages.exercises.filters.muscle} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t.all}</SelectItem>
                {MUSCLE_GROUPS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {messages.muscleGroups[g]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-2" aria-busy={loading}>
          {rows.length === 0 ? (
            <p className="p-4 text-center text-[13px] text-ink-3">{loading ? t.loading : t.empty}</p>
          ) : (
            <ul className="flex flex-col">
              {rows.map((e) => {
                const level = worst(e.id);
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => onPick(e)}
                      className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left outline-none hover:bg-canvas focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <Plus aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-medium text-ink">{e.name}</span>
                        <span className="block text-[12px] text-ink-3">
                          {e.muscleGroups.map((g) => messages.muscleGroups[g]).join(", ")}
                          {e.equipment ? ` · ${e.equipment}` : ""}
                        </span>
                      </span>
                      {level && <LevelBadge level={level} className="shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
