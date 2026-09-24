"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CalendarClock, ChevronLeft, CircleCheck, EyeOff, Link2, Link2Off, Lock, Plus, Printer, ShieldAlert, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { parseBRDate, todayISO } from "@/lib/dates";
import { DateField } from "@/features/students/components/form/DateField";
import { activatePlan, savePlan, type PickerExercise } from "../actions";
import {
  emptyItem,
  emptyWorkout,
  groupItems,
  groupLabel,
  moveBlock,
  moveBlockTo,
  moveWithinGroup,
  normalizeGroups,
  setsFromSummary,
  toBlocks,
  ungroup,
  validateDraft,
  type Block,
  type DraftErrors,
  type ItemDraft,
  type PlanDraft,
  type WorkoutDraft,
} from "../builder";
import type { PlanStatus, StudentRule, TrainingListOption } from "../queries";
import { MAX_ITEMS, MAX_WORKOUTS, PLAN_LEVELS, type PlanLevel } from "../schemas";
import { ExercisePicker } from "./ExercisePicker";
import { DragHandle, ItemCard } from "./ItemCard";

const t = messages.plans;
const NO_LEVEL = "none";

export interface PlanBuilderProps {
  initial: PlanDraft;
  status: PlanStatus | null;
  student: { id: string; name: string } | null;
  /** Professores da organização (select "Professor do plano"); vazio em modelos. */
  trainers?: { id: string; name: string }[];
  /** Listas de métodos e objetivos da organização. */
  lists?: { methods: TrainingListOption[]; objectives: TrainingListOption[] };
  rules: { hidden: boolean; rules: StudentRule[] };
  canEdit: boolean;
  otherActive: { id: string; name: string } | null;
  backHref: string;
}

const NO_LISTS = { methods: [], objectives: [] };

export function PlanBuilder({ initial, status, student, trainers = [], lists = NO_LISTS, rules, canEdit, otherActive, backHref }: PlanBuilderProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<PlanDraft>(initial);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [activeKey, setActiveKey] = useState(initial.workouts[0]?.key ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<{ mode: "add" | "swap" | "substitute"; itemKey?: string } | null>(null);
  const [confirm, setConfirm] = useState<"activate" | "leave" | { removeWorkout: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const isTemplate = draft.studentId === null;
  const readOnly = !canEdit;
  // Início futuro → "Agendar" (vira ativo sozinho na data; job diário no banco).
  const startIso = parseBRDate(draft.startsOn);
  const willSchedule = startIso !== null && startIso > todayISO();
  const workout = draft.workouts.find((w) => w.key === activeKey) ?? draft.workouts[0];

  // Aviso ao fechar/recarregar a aba com alterações não salvas.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const change = (fn: (d: PlanDraft) => PlanDraft) => {
    setDraft(fn);
    setDirty(true);
  };
  const setField = <K extends keyof PlanDraft>(key: K, value: PlanDraft[K]) => {
    change((d) => ({ ...d, [key]: value }));
    // O erro do campo some assim que ele é editado (volta a ser checado ao salvar).
    setErrors((e) => {
      if (!(`plan.${String(key)}` in e)) return e;
      const next = { ...e };
      delete next[`plan.${String(key)}`];
      return next;
    });
  };
  const updateWorkout = (key: string, fn: (w: WorkoutDraft) => WorkoutDraft) =>
    change((d) => ({ ...d, workouts: d.workouts.map((w) => (w.key === key ? fn(w) : w)) }));
  const setItems = (fn: (items: ItemDraft[]) => ItemDraft[]) => workout && updateWorkout(workout.key, (w) => ({ ...w, items: fn(w.items) }));
  const updateItem = (itemKey: string, patch: Partial<ItemDraft>) => {
    setItems((items) => items.map((it) => (it.key === itemKey ? { ...it, ...patch } : it)));
    // Erros dos campos alterados somem na hora (voltam a ser checados ao salvar).
    setErrors((e) => {
      const stale = Object.keys(patch).map((f) => `${itemKey}.${f}`).filter((k) => k in e);
      if (!stale.length) return e;
      const next = { ...e };
      for (const k of stale) delete next[k];
      return next;
    });
  };

  const rulesFor = (exerciseId: string) => rules.rules.filter((r) => r.exerciseId === exerciseId);
  const alertCounts = useMemo(() => {
    let avoid = 0;
    let caution = 0;
    for (const w of draft.workouts)
      for (const it of w.items) {
        const r = rules.rules.filter((x) => x.exerciseId === it.exerciseId);
        if (r.some((x) => x.level === "avoid")) avoid++;
        else if (r.length) caution++;
      }
    return { avoid, caution };
  }, [draft.workouts, rules.rules]);

  const switchWorkout = (key: string) => {
    setActiveKey(key);
    setSelected(new Set());
  };

  // ---------------------------------------------------------------------------
  // Salvar / ativar
  // ---------------------------------------------------------------------------

  const firstErrorWorkout = (errs: DraftErrors) => {
    const owners = new Set(Object.keys(errs).map((k) => k.split(".")[0]));
    return draft.workouts.find(
      (w) => owners.has(w.key) || w.items.some((it) => owners.has(it.key) || it.setsDetail.some((s) => owners.has(s.key))),
    );
  };

  const persist = async (): Promise<string | null> => {
    const v = validateDraft(draft);
    if (!v.ok) {
      setErrors(v.errors);
      const w = firstErrorWorkout(v.errors);
      if (w) switchWorkout(w.key);
      toast.error(t.actions.errors);
      return null;
    }
    setErrors({});
    const r = await savePlan(v.payload);
    if (!r.ok) {
      toast.error(r.error);
      return null;
    }
    setDirty(false);
    setDraft((d) => ({ ...d, id: r.id }));
    return r.id;
  };

  const onSave = () =>
    startTransition(async () => {
      const wasNew = draft.id === null;
      const id = await persist();
      if (!id) return;
      toast.success(isTemplate ? t.actions.templateSaved : t.actions.saved);
      if (wasNew) router.replace(`/treinos/${id}/editar`);
      else router.refresh();
    });

  const onActivate = () =>
    startTransition(async () => {
      if (!student) return;
      const id = dirty || !draft.id ? await persist() : draft.id;
      if (!id) return setConfirm(null);
      const r = await activatePlan(id, student.id);
      setConfirm(null);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      router.push(backHref);
    });

  const askActivate = () => {
    const needsEnd = !draft.noEnd && !draft.endsOn.trim();
    if (!draft.startsOn.trim() || needsEnd) {
      setErrors((e) => ({
        ...e,
        ...(draft.startsOn.trim() ? {} : { "plan.startsOn": t.actions.datesRequired }),
        ...(needsEnd ? { "plan.endsOn": t.actions.datesRequired } : {}),
      }));
      toast.error(t.actions.datesRequired);
      return;
    }
    setConfirm("activate");
  };

  // ---------------------------------------------------------------------------
  // Divisões
  // ---------------------------------------------------------------------------

  const addWorkout = () => {
    if (draft.workouts.length >= MAX_WORKOUTS) return void toast.error(t.workouts.max);
    const w = emptyWorkout(draft.workouts);
    change((d) => ({ ...d, workouts: [...d.workouts, w] }));
    switchWorkout(w.key);
  };
  const moveWorkout = (key: string, delta: -1 | 1) =>
    change((d) => {
      const i = d.workouts.findIndex((w) => w.key === key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= d.workouts.length) return d;
      const ws = [...d.workouts];
      [ws[i], ws[j]] = [ws[j], ws[i]];
      return { ...d, workouts: ws };
    });
  const removeWorkout = (key: string) => {
    const rest = draft.workouts.filter((w) => w.key !== key);
    change((d) => ({ ...d, workouts: d.workouts.filter((w) => w.key !== key) }));
    switchWorkout(rest[0]?.key ?? "");
    setConfirm(null);
  };

  // ---------------------------------------------------------------------------
  // Exercícios
  // ---------------------------------------------------------------------------

  const onPick = (e: PickerExercise) => {
    if (!workout) return;
    if (picker?.mode === "substitute" && picker.itemKey) {
      const it = workout.items.find((x) => x.key === picker.itemKey);
      if (!it) return;
      if (it.exerciseId === e.id) return void toast.error(t.substitutes.same);
      if (it.substitutes.some((s) => s.id === e.id)) return void toast.error(t.substitutes.duplicate);
      if (it.substitutes.length >= 3) return void toast.error(t.substitutes.max);
      updateItem(it.key, { substitutes: [...it.substitutes, { id: e.id, name: e.name }] });
      toast.success(t.substitutes.added(e.name), { duration: 1500 });
      setPicker(null);
      return;
    }
    if (picker?.mode === "swap" && picker.itemKey) {
      updateItem(picker.itemKey, { exerciseId: e.id, exerciseName: e.name });
      setPicker(null);
      return;
    }
    if (workout.items.length >= MAX_ITEMS) return void toast.error(t.items.max);
    setItems((items) => [...items, emptyItem(e)]);
    toast.success(t.picker.added(e.name), { duration: 1500 });
  };

  const onGroup = () => {
    const r = groupItems(workout?.items ?? [], selected);
    if (!r.ok) return void toast.error(r.error);
    setItems(() => r.items);
    setSelected(new Set());
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => (dirty ? setConfirm("leave") : router.push(backHref))}
          className="inline-flex w-fit items-center gap-1 rounded text-xs text-ink-3 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ChevronLeft aria-hidden className="size-3.5" />
          {t.actions.back}
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-[22px]">
            {draft.id ? (isTemplate ? t.editTemplateTitle : t.editTitle) : isTemplate ? t.newTemplateTitle : t.newTitle}
          </h1>
          {isTemplate && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">{t.templateBadge}</span>}
          {status && <StatusBadge status={status} />}
          {draft.id && (
            <Button asChild variant="outline" size="sm" className="ml-auto">
              {/* A impressão mostra o que está salvo: com alterações pendentes, salve antes. */}
              <Link href={`/treinos/${draft.id}/imprimir`} aria-disabled={dirty} onClick={(e) => dirty && (e.preventDefault(), toast.info(t.print.saveFirst))}>
                <Printer aria-hidden />
                {messages.plans.manage.print}
              </Link>
            </Button>
          )}
        </div>
        {student && <p className="text-[13px] text-ink-2">{student.name}</p>}
        {readOnly && (
          <p className="flex items-center gap-1.5 rounded-xl bg-canvas px-3 py-2 text-[13px] text-ink-2">
            <Lock aria-hidden className="size-4" />
            {status === "archived" ? t.actions.readOnlyArchived : t.actions.readOnlyTemplate}
          </p>
        )}
      </header>

      {/* Cabeçalho do plano */}
      <section aria-label={t.header.section} className="grid gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
        <LabeledField id="plan-name" label={t.header.name} error={errors["plan.name"]} className="sm:col-span-2">
          <Input id="plan-name" value={draft.name} maxLength={120} placeholder={t.header.namePlaceholder} disabled={readOnly} aria-invalid={!!errors["plan.name"]} onChange={(e) => setField("name", e.target.value)} />
        </LabeledField>
        <LabeledField id="plan-goal" label={t.header.goal} className="lg:col-span-1">
          <Input id="plan-goal" value={draft.goal} maxLength={200} placeholder={t.header.goalPlaceholder} disabled={readOnly} onChange={(e) => setField("goal", e.target.value)} />
        </LabeledField>
        <LabeledField id="plan-level" label={t.header.level}>
          <Select value={draft.level || NO_LEVEL} disabled={readOnly} onValueChange={(v) => setField("level", v === NO_LEVEL ? "" : (v as PlanLevel))}>
            <SelectTrigger id="plan-level" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_LEVEL}>{t.noLevel}</SelectItem>
              {PLAN_LEVELS.map((l) => (
                <SelectItem key={l} value={l}>
                  {t.levels[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </LabeledField>
        {!isTemplate && (
          <>
            <LabeledField id="plan-starts" label={t.header.startsOn} error={errors["plan.startsOn"]}>
              {readOnly ? (
                <Input id="plan-starts" value={draft.startsOn} disabled />
              ) : (
                <DateField id="plan-starts" value={draft.startsOn} onChange={(v) => setField("startsOn", v)} invalid={!!errors["plan.startsOn"]} min="2020-01-01" />
              )}
            </LabeledField>
            <LabeledField id="plan-ends" label={t.header.endsOn} error={errors["plan.endsOn"]}>
              {draft.noEnd ? (
                <Input id="plan-ends" value={t.header.noEnd} disabled />
              ) : readOnly ? (
                <Input id="plan-ends" value={draft.endsOn} disabled />
              ) : (
                <DateField id="plan-ends" value={draft.endsOn} onChange={(v) => setField("endsOn", v)} invalid={!!errors["plan.endsOn"]} min="2020-01-01" />
              )}
            </LabeledField>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="plan-no-end"
                  checked={draft.noEnd}
                  disabled={readOnly}
                  onCheckedChange={(v) => change((d) => ({ ...d, noEnd: v, endsOn: v ? "" : d.endsOn }))}
                />
                <label htmlFor="plan-no-end" className="text-sm font-medium text-ink">
                  {t.header.noEnd}
                </label>
              </div>
              <p className="text-xs text-ink-3">{t.header.noEndHint}</p>
            </div>
            <LabeledField id="plan-sessions" label={t.header.plannedSessions} error={errors["plan.plannedSessions"]}>
              <Input
                id="plan-sessions"
                inputMode="numeric"
                value={draft.plannedSessions}
                disabled={readOnly}
                aria-invalid={!!errors["plan.plannedSessions"]}
                aria-describedby="plan-sessions-hint"
                onChange={(e) => setField("plannedSessions", e.target.value)}
              />
              <p id="plan-sessions-hint" className="text-xs text-ink-3">
                {t.header.plannedSessionsHint}
              </p>
            </LabeledField>
            <LabeledField id="plan-trainer" label={t.header.trainer} error={errors["plan.trainerId"]}>
              <Select value={draft.trainerId || undefined} disabled={readOnly || trainers.length === 0} onValueChange={(v) => setField("trainerId", v)}>
                <SelectTrigger id="plan-trainer" className="w-full" aria-describedby="plan-trainer-hint">
                  <SelectValue placeholder={t.header.trainerHint} />
                </SelectTrigger>
                <SelectContent>
                  {trainers.map((tr) => (
                    <SelectItem key={tr.id} value={tr.id}>
                      {tr.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p id="plan-trainer-hint" className="text-xs text-ink-3">
                {t.header.trainerHint}
              </p>
            </LabeledField>
          </>
        )}
        <LabeledField id="plan-notes" label={t.header.notes} className={isTemplate ? "sm:col-span-2 lg:col-span-4" : "sm:col-span-2"}>
          <Textarea id="plan-notes" rows={2} value={draft.notes} maxLength={2000} placeholder={t.header.notesPlaceholder} disabled={readOnly} onChange={(e) => setField("notes", e.target.value)} />
        </LabeledField>
      </section>

      {/* Alertas (só plano de aluno) */}
      {student && <AlertsPanel hidden={rules.hidden} restricted={rules.rules.some((r) => r.restricted)} counts={alertCounts} />}

      {/* Divisões */}
      <section aria-label={t.workouts.label} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label={t.workouts.label} className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1 shadow-card">
            {draft.workouts.map((w) => {
              const hasError = Object.keys(errors).some((k) => {
                const owner = k.split(".")[0];
                return owner === w.key || w.items.some((it) => it.key === owner || it.setsDetail.some((s) => s.key === owner));
              });
              return (
                <button
                  key={w.key}
                  type="button"
                  role="tab"
                  id={`tab-${w.key}`}
                  aria-selected={w.key === workout?.key}
                  aria-controls={`panel-${w.key}`}
                  onClick={() => switchWorkout(w.key)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                    w.key === workout?.key ? "bg-brand-50 text-brand-700" : "text-ink-2 hover:text-ink",
                    hasError && "text-destructive",
                  )}
                >
                  <span className="font-semibold">{w.label || "?"}</span>
                  {w.name && <span className="hidden max-w-32 truncate sm:inline">{w.name}</span>}
                  <span className="tabular text-[11px] text-ink-3">{w.items.length}</span>
                </button>
              );
            })}
          </div>
          {!readOnly && (
            <Button type="button" variant="outline" size="sm" onClick={addWorkout} disabled={draft.workouts.length >= MAX_WORKOUTS}>
              <Plus aria-hidden />
              {t.workouts.add}
            </Button>
          )}
        </div>

        {workout && (
          <div role="tabpanel" id={`panel-${workout.key}`} aria-labelledby={`tab-${workout.key}`} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
            <div className="grid gap-3 sm:grid-cols-[6rem_1fr_auto]">
              <LabeledField id={`${workout.key}-label`} label={t.workouts.rename} error={errors[`${workout.key}.label`]}>
                <Input
                  id={`${workout.key}-label`}
                  value={workout.label}
                  maxLength={10}
                  disabled={readOnly}
                  aria-invalid={!!errors[`${workout.key}.label`]}
                  onChange={(e) => updateWorkout(workout.key, (w) => ({ ...w, label: e.target.value }))}
                />
              </LabeledField>
              <LabeledField id={`${workout.key}-name`} label={t.workouts.name}>
                <Input
                  id={`${workout.key}-name`}
                  value={workout.name}
                  maxLength={80}
                  placeholder={t.workouts.namePlaceholder}
                  disabled={readOnly}
                  onChange={(e) => updateWorkout(workout.key, (w) => ({ ...w, name: e.target.value }))}
                />
              </LabeledField>
              {!readOnly && (
                <div className="flex items-end gap-1">
                  <Button type="button" variant="ghost" size="icon" aria-label={t.workouts.moveLeft} disabled={draft.workouts[0]?.key === workout.key} onClick={() => moveWorkout(workout.key, -1)}>
                    <ArrowLeft aria-hidden />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={t.workouts.moveRight} disabled={draft.workouts.at(-1)?.key === workout.key} onClick={() => moveWorkout(workout.key, 1)}>
                    <ArrowRight aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`${t.workouts.remove} ${workout.label}`}
                    className="hover:text-danger"
                    onClick={() => (workout.items.length ? setConfirm({ removeWorkout: workout.key }) : removeWorkout(workout.key))}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              )}
            </div>
            <LabeledField id={`${workout.key}-notes`} label={t.workouts.notes}>
              <Input
                id={`${workout.key}-notes`}
                value={workout.notes}
                maxLength={500}
                disabled={readOnly}
                onChange={(e) => updateWorkout(workout.key, (w) => ({ ...w, notes: e.target.value }))}
              />
            </LabeledField>

            {!readOnly && workout.items.length > 1 && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-canvas px-3 py-2">
                <span className="text-[13px] text-ink-2">{t.groups.selectHint(selected.size)}</span>
                <Button type="button" size="sm" variant="outline" disabled={selected.size < 2} onClick={onGroup}>
                  <Link2 aria-hidden />
                  {t.groups.group}
                </Button>
              </div>
            )}

            {workout.items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line-strong/70 px-4 py-8 text-center text-[13px] text-ink-3">{t.workouts.empty}</p>
            ) : (
              <ItemsList
                items={workout.items}
                errors={errors}
                readOnly={readOnly}
                selected={selected}
                rulesFor={rulesFor}
                onItems={(fn) => setItems(fn)}
                onUpdateItem={updateItem}
                onSelect={(key, value) =>
                  setSelected((s) => {
                    const next = new Set(s);
                    if (value) next.add(key);
                    else next.delete(key);
                    return next;
                  })
                }
                onSwap={(key) => setPicker({ mode: "swap", itemKey: key })}
                onAddSubstitute={(key) => setPicker({ mode: "substitute", itemKey: key })}
                lists={lists}
              />
            )}

            {!readOnly && (
              <div>
                <Button type="button" onClick={() => setPicker({ mode: "add" })} disabled={workout.items.length >= MAX_ITEMS}>
                  <Plus aria-hidden />
                  {t.items.add}
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Barra de ações */}
      {!readOnly && (
        <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-surface/95 backdrop-blur sm:-mx-6 lg:-mx-8">
          <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 sm:px-6 lg:px-8">
            {dirty && <span className="mr-auto text-[13px] text-ink-3">{t.actions.unsaved}</span>}
            <Button type="button" variant={student ? "outline" : "default"} onClick={onSave} disabled={pending || (!dirty && draft.id !== null)}>
              {draft.id ? t.actions.saveChanges : t.actions.save}
            </Button>
            {student && status !== "active" && (
              <Button type="button" onClick={askActivate} disabled={pending}>
                {willSchedule ? <CalendarClock aria-hidden /> : <CircleCheck aria-hidden />}
                {willSchedule ? t.actions.schedule : t.actions.activate}
              </Button>
            )}
          </div>
        </div>
      )}

      {workout && (
        <ExercisePicker
          open={picker !== null}
          mode={picker?.mode ?? "add"}
          workoutLabel={workout.label}
          rules={rules.rules}
          onOpenChange={(open) => !open && setPicker(null)}
          onPick={onPick}
        />
      )}

      <ConfirmDialog
        open={confirm === "activate"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={willSchedule ? t.actions.scheduleTitle : t.actions.activateTitle}
        description={
          willSchedule ? (
            t.actions.scheduleText(draft.startsOn)
          ) : (
            <>
              {t.actions.activateText}
              {otherActive && <strong className="mt-2 block text-ink">{t.actions.activateReplace(otherActive.name)}</strong>}
            </>
          )
        }
        confirmLabel={willSchedule ? t.actions.schedule : t.actions.activate}
        cancelLabel={messages.students.confirm.cancel}
        pending={pending}
        onConfirm={onActivate}
      />
      <ConfirmDialog
        open={confirm === "leave"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t.actions.leaveTitle}
        description={t.actions.leaveText}
        confirmLabel={t.actions.leave}
        cancelLabel={messages.students.confirm.cancel}
        destructive
        onConfirm={() => {
          setDirty(false);
          router.push(backHref);
        }}
      />
      <ConfirmDialog
        open={typeof confirm === "object" && confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t.workouts.removeTitle}
        description={(() => {
          const w = typeof confirm === "object" && confirm ? draft.workouts.find((x) => x.key === confirm.removeWorkout) : null;
          return w ? t.workouts.removeText(w.label, w.items.length) : "";
        })()}
        confirmLabel={t.workouts.remove}
        cancelLabel={messages.students.confirm.cancel}
        destructive
        onConfirm={() => typeof confirm === "object" && confirm && removeWorkout(confirm.removeWorkout)}
      />
    </div>
  );
}

function LabeledField({ id, label, error, className, children }: { id: string; label: string; error?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: PlanStatus }) {
  const style = { draft: "bg-zinc-100 text-zinc-700", active: "bg-emerald-50 text-emerald-700", scheduled: "bg-sky-50 text-sky-700", archived: "bg-zinc-100 text-zinc-600" }[status];
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", style)}>{t.status[status]}</span>;
}

function AlertsPanel({ hidden, restricted, counts }: { hidden: boolean; restricted: boolean; counts: { avoid: number; caution: number } }) {
  if (hidden) {
    return (
      <p className="flex items-start gap-2 rounded-2xl border border-line bg-canvas px-4 py-3 text-[13px] text-ink-2">
        <EyeOff aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" />
        {t.alerts.hidden}
      </p>
    );
  }
  const any = counts.avoid + counts.caution > 0;
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-2xl border px-4 py-3 text-[13px]",
        counts.avoid ? "border-red-200 bg-red-50 text-red-800" : counts.caution ? "border-amber-200 bg-amber-50 text-amber-900" : "border-line bg-surface text-ink-2",
      )}
    >
      <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-semibold">{t.alerts.title}</p>
        <p>{any ? `${t.alerts.summary(counts.avoid, counts.caution)}. ${t.alerts.notBlocking}` : t.alerts.none}</p>
        {restricted && <p className="mt-1 text-xs opacity-90">{t.alerts.restrictedPanel}</p>}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Lista com arrastar e soltar (blocos: item isolado ou agrupamento)
// -----------------------------------------------------------------------------

interface ItemsListProps {
  items: ItemDraft[];
  errors: DraftErrors;
  readOnly: boolean;
  selected: Set<string>;
  rulesFor: (exerciseId: string) => StudentRule[];
  onItems: (fn: (items: ItemDraft[]) => ItemDraft[]) => void;
  onUpdateItem: (key: string, patch: Partial<ItemDraft>) => void;
  onSelect: (key: string, value: boolean) => void;
  onSwap: (key: string) => void;
  onAddSubstitute: (key: string) => void;
  lists: { methods: TrainingListOption[]; objectives: TrainingListOption[] };
}

function blockName(block: Block) {
  return block.groupKey
    ? `${groupLabel(block.items.length)} (${block.items.map((i) => i.exerciseName).join(", ")})`
    : (block.items[0]?.exerciseName ?? "");
}

function ItemsList({ items, errors, readOnly, selected, rulesFor, onItems, onUpdateItem, onSelect, onSwap, onAddSubstitute, lists }: ItemsListProps) {
  const blocks = toBlocks(items);
  // id estável: sem ele o aria-describedby gerado pelo dnd-kit difere entre servidor e cliente (hidratação).
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const nameOf = (id: UniqueIdentifier) => {
    const b = blocks.find((x) => x.id === id);
    return b ? blockName(b) : "";
  };
  const positionOf = (id: UniqueIdentifier) => blocks.findIndex((x) => x.id === id) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `${nameOf(active.id)} selecionado. Posição ${positionOf(active.id)} de ${blocks.length}.`,
    onDragOver: ({ active, over }) => (over ? `${nameOf(active.id)} na posição ${positionOf(over.id)} de ${blocks.length}.` : `${nameOf(active.id)} fora da lista.`),
    onDragEnd: ({ active, over }) => (over ? `${nameOf(active.id)} solto na posição ${positionOf(over.id)}.` : `${nameOf(active.id)} solto.`),
    onDragCancel: ({ active }) => `Movimento cancelado. ${nameOf(active.id)} voltou à posição original.`,
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onItems((its) => moveBlockTo(its, String(active.id), String(over.id)));
  };

  // Posição (1, 2, 3…) do primeiro item de cada bloco na divisão.
  const starts = blocks.map((_, bi) => blocks.slice(0, bi).reduce((n, b) => n + b.items.length, 0));
  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: "Para mover, pressione espaço ou Enter, use as setas para cima e para baixo e pressione espaço ou Enter para soltar. Esc cancela.",
        },
      }}
    >
      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col gap-3">
          {blocks.map((block, bi) => {
            const start = starts[bi];
            return (
              <SortableBlock key={block.id} id={block.id} disabled={readOnly}>
                {(handle) =>
                  block.groupKey ? (
                    <div className="flex flex-col gap-2 rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/40 p-2">
                      <div className="flex flex-wrap items-center gap-2 px-1">
                        {!readOnly && <DragHandle label={`${t.groups.dragGroup}: ${blockName(block)}`} {...handle} />}
                        <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-800">{groupLabel(block.items.length)}</span>
                        {!readOnly && (
                          <div className="ml-auto flex items-center">
                            <Button type="button" variant="ghost" size="icon-sm" aria-label={t.groups.moveGroupUp} disabled={bi === 0} onClick={() => onItems((its) => moveBlock(its, block.id, -1))}>
                              <ArrowUp aria-hidden />
                            </Button>
                            <Button type="button" variant="ghost" size="icon-sm" aria-label={t.groups.moveGroupDown} disabled={bi === blocks.length - 1} onClick={() => onItems((its) => moveBlock(its, block.id, 1))}>
                              <ArrowDown aria-hidden />
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => onItems((its) => ungroup(its, block.groupKey!))}>
                              <Link2Off aria-hidden />
                              {t.groups.ungroup}
                            </Button>
                          </div>
                        )}
                      </div>
                      {block.items.map((item, ii) => (
                        <ItemCard
                          key={item.key}
                          item={item}
                          index={start + ii}
                          errors={errors}
                          rules={rulesFor(item.exerciseId)}
                          readOnly={readOnly}
                          selected={selected.has(item.key)}
                          canMoveUp={ii > 0}
                          canMoveDown={ii < block.items.length - 1}
                          onSelect={(v) => onSelect(item.key, v)}
                          onChange={(patch) => onUpdateItem(item.key, patch)}
                          onMove={(delta) => onItems((its) => moveWithinGroup(its, item.key, delta))}
                          onRemove={() => onItems((its) => normalizeGroups(its.filter((x) => x.key !== item.key)))}
                          onSwap={() => onSwap(item.key)}
                          onGenerateSets={() => onUpdateItem(item.key, { setsDetail: setsFromSummary(item) })}
                          rulesFor={rulesFor}
                          onAddSubstitute={() => onAddSubstitute(item.key)}
                          lists={lists}
                        />
                      ))}
                    </div>
                  ) : (
                    <ItemCard
                      item={block.items[0]}
                      index={start}
                      errors={errors}
                      rules={rulesFor(block.items[0].exerciseId)}
                      readOnly={readOnly}
                      selected={selected.has(block.items[0].key)}
                      canMoveUp={bi > 0}
                      canMoveDown={bi < blocks.length - 1}
                      dragHandle={!readOnly && <DragHandle label={`${t.items.drag}: ${block.items[0].exerciseName}`} {...handle} />}
                      onSelect={(v) => onSelect(block.items[0].key, v)}
                      onChange={(patch) => onUpdateItem(block.items[0].key, patch)}
                      onMove={(delta) => onItems((its) => moveBlock(its, block.id, delta))}
                      onRemove={() => onItems((its) => its.filter((x) => x.key !== block.items[0].key))}
                      onSwap={() => onSwap(block.items[0].key)}
                      onGenerateSets={() => onUpdateItem(block.items[0].key, { setsDetail: setsFromSummary(block.items[0]) })}
                      rulesFor={rulesFor}
                      onAddSubstitute={() => onAddSubstitute(block.items[0].key)}
                      lists={lists}
                    />
                  )
                }
              </SortableBlock>
            );
          })}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

type HandleProps = { listeners?: Record<string, unknown>; attributes?: Record<string, unknown> };

function SortableBlock({ id, disabled, children }: { id: string; disabled: boolean; children: (handle: HandleProps) => ReactNode }) {
  const { setNodeRef, transform, transition, isDragging, listeners, attributes } = useSortable({ id, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("list-none", isDragging && "relative z-10 opacity-80 shadow-lg")}
    >
      {children({ listeners: listeners as Record<string, unknown> | undefined, attributes: attributes as unknown as Record<string, unknown> })}
    </li>
  );
}
