/**
 * Lógica pura do montador de treino (sem React): rascunho editável em strings,
 * blocos (agrupamentos movem juntos), agrupar/desagrupar e conversão para o
 * payload de save_training_plan. Testada em tests/unit/plan-builder.test.ts.
 */
import { isoToBR, parseBRDate } from "@/lib/dates";
import { messages } from "@/messages/pt-BR";
import { planPayloadSchema, type LoadUnit, type PlanLevel, type PlanPayload, type SetType } from "./schemas";

export interface SetDraft {
  key: string;
  setType: SetType;
  reps: string;
  loadValue: string;
  loadUnit: LoadUnit;
  loadText: string;
  rest: string;
}

export interface ItemDraft {
  key: string;
  exerciseId: string;
  exerciseName: string;
  groupKey: string | null;
  sets: string;
  reps: string;
  loadValue: string;
  loadUnit: LoadUnit;
  loadText: string;
  rest: string;
  tempo: string;
  rpe: string;
  notes: string;
  setsDetail: SetDraft[];
}

export interface WorkoutDraft {
  key: string;
  label: string;
  name: string;
  notes: string;
  items: ItemDraft[];
}

export interface PlanDraft {
  id: string | null;
  studentId: string | null;
  name: string;
  goal: string;
  level: PlanLevel | "";
  /** dd/mm/aaaa */
  startsOn: string;
  endsOn: string;
  notes: string;
  workouts: WorkoutDraft[];
}

export interface Block {
  /** groupKey do agrupamento ou key do item isolado. */
  id: string;
  groupKey: string | null;
  items: ItemDraft[];
}

export const newKey = () => crypto.randomUUID();
export const newGroupKey = () => `g${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;

export function emptyItem(exercise: { id: string; name: string }): ItemDraft {
  return {
    key: newKey(),
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    groupKey: null,
    sets: "3",
    reps: "10–12",
    loadValue: "",
    loadUnit: "kg",
    loadText: "",
    rest: "60",
    tempo: "",
    rpe: "",
    notes: "",
    setsDetail: [],
  };
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export function nextLabel(workouts: WorkoutDraft[]) {
  const used = new Set(workouts.map((w) => w.label.trim().toUpperCase()));
  return [...LETTERS].find((l) => !used.has(l)) ?? String(workouts.length + 1);
}

export function emptyWorkout(workouts: WorkoutDraft[]): WorkoutDraft {
  return { key: newKey(), label: nextLabel(workouts), name: "", notes: "", items: [] };
}

export function groupLabel(size: number) {
  return messages.plans.groupLabel(size);
}

/** Itens consecutivos com o mesmo groupKey formam um bloco. */
export function toBlocks(items: ItemDraft[]): Block[] {
  const blocks: Block[] = [];
  for (const item of items) {
    const last = blocks.at(-1);
    if (item.groupKey && last?.groupKey === item.groupKey) last.items.push(item);
    else blocks.push({ id: item.groupKey ?? item.key, groupKey: item.groupKey, items: [item] });
  }
  return blocks;
}

const flatten = (blocks: Block[]) => blocks.flatMap((b) => b.items);

/** Move um bloco inteiro (item isolado ou agrupamento) para outra posição de bloco. */
export function moveBlockTo(items: ItemDraft[], fromId: string, toId: string) {
  const blocks = toBlocks(items);
  const from = blocks.findIndex((b) => b.id === fromId);
  const to = blocks.findIndex((b) => b.id === toId);
  if (from < 0 || to < 0 || from === to) return items;
  const [moved] = blocks.splice(from, 1);
  blocks.splice(to, 0, moved);
  return flatten(blocks);
}

export function moveBlock(items: ItemDraft[], blockId: string, delta: -1 | 1) {
  const blocks = toBlocks(items);
  const i = blocks.findIndex((b) => b.id === blockId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= blocks.length) return items;
  return moveBlockTo(items, blockId, blocks[j].id);
}

/** Reordena um item dentro do próprio agrupamento. */
export function moveWithinGroup(items: ItemDraft[], itemKey: string, delta: -1 | 1) {
  const i = items.findIndex((it) => it.key === itemKey);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= items.length || !items[i].groupKey || items[j].groupKey !== items[i].groupKey) return items;
  const next = [...items];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/**
 * Garante agrupamentos válidos: cada groupKey forma uma única sequência contígua
 * de 2+ itens. Sequências repetidas ganham chave nova; sequências de 1 item são desfeitas.
 */
export function normalizeGroups(items: ItemDraft[]): ItemDraft[] {
  const seen = new Set<string>();
  const out = items.map((it) => ({ ...it }));
  let i = 0;
  while (i < out.length) {
    const g = out[i].groupKey;
    let j = i + 1;
    while (g && j < out.length && out[j].groupKey === g) j++;
    if (g) {
      if (j - i < 2) out[i].groupKey = null;
      else if (seen.has(g)) {
        const fresh = newGroupKey();
        for (let k = i; k < j; k++) out[k].groupKey = fresh;
        seen.add(fresh);
      } else seen.add(g);
    }
    i = j;
  }
  return out;
}

export type GroupResult = { ok: true; items: ItemDraft[] } | { ok: false; error: string };

/** Agrupa itens selecionados (precisam estar em sequência). */
export function groupItems(items: ItemDraft[], selected: Set<string>): GroupResult {
  const idx = items.map((it, i) => (selected.has(it.key) ? i : -1)).filter((i) => i >= 0);
  if (idx.length < 2) return { ok: false, error: messages.plans.groups.needTwo };
  if (idx.at(-1)! - idx[0] + 1 !== idx.length) return { ok: false, error: messages.plans.groups.notContiguous };
  const key = newGroupKey();
  return { ok: true, items: normalizeGroups(items.map((it) => (selected.has(it.key) ? { ...it, groupKey: key } : it))) };
}

export function ungroup(items: ItemDraft[], groupKey: string) {
  return items.map((it) => (it.groupKey === groupKey ? { ...it, groupKey: null } : it));
}

/** Séries detalhadas a partir do resumo (N séries de trabalho com as mesmas reps/carga). */
export function setsFromSummary(item: ItemDraft): SetDraft[] {
  const n = Math.min(Math.max(Number.parseInt(item.sets, 10) || 3, 1), 20);
  return Array.from({ length: n }, () => ({
    key: newKey(),
    setType: "work" as const,
    reps: item.reps,
    loadValue: item.loadValue,
    loadUnit: item.loadUnit,
    loadText: item.loadText,
    rest: item.rest,
  }));
}

// ---------------------------------------------------------------------------
// Conversão rascunho ⇄ payload
// ---------------------------------------------------------------------------

const text = (s: string) => (s.trim() === "" ? null : s.trim());
/** "12,5" → 12.5 · "" → null · inválido → NaN (o schema acusa). */
export function parseNumber(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : Number.NaN;
}
const date = (s: string) => (s.trim() === "" ? null : (parseBRDate(s) ?? "invalida"));

export function toPayload(draft: PlanDraft): unknown {
  const load = (value: string, unit: LoadUnit) => {
    const n = parseNumber(value);
    return { load_value: n, load_unit: n === null ? null : unit };
  };
  return {
    id: draft.id,
    student_id: draft.studentId,
    name: draft.name.trim(),
    goal: text(draft.goal),
    level: draft.level || null,
    starts_on: date(draft.startsOn),
    ends_on: date(draft.endsOn),
    notes: text(draft.notes),
    workouts: draft.workouts.map((w) => ({
      label: w.label.trim(),
      name: text(w.name),
      notes: text(w.notes),
      items: w.items.map((it) => ({
        exercise_id: it.exerciseId,
        group_key: it.groupKey,
        sets: parseNumber(it.sets),
        reps: text(it.reps),
        ...load(it.loadValue, it.loadUnit),
        load_text: text(it.loadText),
        rest_seconds: parseNumber(it.rest),
        tempo: text(it.tempo)?.toUpperCase() ?? null,
        rpe_target: parseNumber(it.rpe),
        notes: text(it.notes),
        sets_detail: it.setsDetail.map((s) => ({
          set_type: s.setType,
          reps: text(s.reps),
          ...load(s.loadValue, s.loadUnit),
          load_text: text(s.loadText),
          rest_seconds: parseNumber(s.rest),
        })),
      })),
    })),
  };
}

/** Campo do payload → campo do rascunho (para destacar o erro no lugar certo). */
const FIELD: Record<string, string> = {
  sets: "sets",
  reps: "reps",
  load_value: "loadValue",
  load_unit: "loadValue",
  load_text: "loadText",
  rest_seconds: "rest",
  tempo: "tempo",
  rpe_target: "rpe",
  notes: "notes",
  group_key: "groupKey",
  set_type: "setType",
  label: "label",
  name: "name",
  goal: "goal",
  level: "level",
  starts_on: "startsOn",
  ends_on: "endsOn",
};

export type DraftErrors = Record<string, string>;

/**
 * Valida o rascunho com o mesmo schema do servidor. Chaves de erro:
 * "plan.<campo>", "<workoutKey>.<campo>", "<itemKey>.<campo>", "<setKey>.<campo>".
 */
export function validateDraft(draft: PlanDraft): { ok: true; payload: PlanPayload } | { ok: false; errors: DraftErrors } {
  const parsed = planPayloadSchema.safeParse(toPayload(draft));
  if (parsed.success) return { ok: true, payload: parsed.data };
  const errors: DraftErrors = {};
  for (const issue of parsed.error.issues) {
    const p = issue.path;
    let owner = "plan";
    let field = String(p.at(-1));
    if (p[0] === "workouts" && typeof p[1] === "number") {
      const w = draft.workouts[p[1]];
      owner = w?.key ?? "plan";
      if (p[2] === "items" && typeof p[3] === "number") {
        const it = w?.items[p[3]];
        owner = it?.key ?? owner;
        if (p[4] === "sets_detail" && typeof p[5] === "number") owner = it?.setsDetail[p[5]]?.key ?? owner;
      }
    }
    field = FIELD[field] ?? field;
    const key = `${owner}.${field}`;
    errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}

// ---------------------------------------------------------------------------
// Plano salvo → rascunho
// ---------------------------------------------------------------------------

export interface SavedPlan {
  id: string;
  studentId: string | null;
  name: string;
  goal: string | null;
  level: PlanLevel | null;
  startsOn: string | null;
  endsOn: string | null;
  notes: string | null;
  workouts: {
    label: string;
    name: string | null;
    notes: string | null;
    items: {
      exerciseId: string;
      exerciseName: string;
      groupKey: string | null;
      sets: number | null;
      reps: string | null;
      loadValue: number | null;
      loadUnit: LoadUnit | null;
      loadText: string | null;
      restSeconds: number | null;
      tempo: string | null;
      rpeTarget: number | null;
      notes: string | null;
      setsDetail: {
        setType: SetType;
        reps: string | null;
        loadValue: number | null;
        loadUnit: LoadUnit | null;
        loadText: string | null;
        restSeconds: number | null;
      }[];
    }[];
  }[];
}

const str = (v: string | number | null) => (v === null ? "" : String(v).replace(".", ","));

export function fromSaved(plan: SavedPlan): PlanDraft {
  return {
    id: plan.id,
    studentId: plan.studentId,
    name: plan.name,
    goal: plan.goal ?? "",
    level: plan.level ?? "",
    startsOn: plan.startsOn ? isoToBR(plan.startsOn) : "",
    endsOn: plan.endsOn ? isoToBR(plan.endsOn) : "",
    notes: plan.notes ?? "",
    workouts: plan.workouts.map((w) => ({
      key: newKey(),
      label: w.label,
      name: w.name ?? "",
      notes: w.notes ?? "",
      items: w.items.map((it) => ({
        key: newKey(),
        exerciseId: it.exerciseId,
        exerciseName: it.exerciseName,
        groupKey: it.groupKey,
        sets: str(it.sets),
        reps: it.reps ?? "",
        loadValue: str(it.loadValue),
        loadUnit: it.loadUnit ?? "kg",
        loadText: it.loadText ?? "",
        rest: str(it.restSeconds),
        tempo: it.tempo ?? "",
        rpe: str(it.rpeTarget),
        notes: it.notes ?? "",
        setsDetail: it.setsDetail.map((s) => ({
          key: newKey(),
          setType: s.setType,
          reps: s.reps ?? "",
          loadValue: str(s.loadValue),
          loadUnit: s.loadUnit ?? "kg",
          loadText: s.loadText ?? "",
          rest: str(s.restSeconds),
        })),
      })),
    })),
  };
}
