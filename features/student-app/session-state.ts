/**
 * Estado da tela de execução (lógica pura): o que o servidor já tem (`get_training_session`) + o que ainda está na
 * fila local (reaplicado ao recarregar sem internet). Testada em tests/unit/student-session-state.test.ts.
 */
import { setTargets } from "./format";
import type { QueueOp } from "./queue";
import type { AppItem, AppTrainingSession } from "./types";

export interface SetEntry {
  qty: string;
  load: string;
  done: boolean;
}

export interface ItemState {
  sets: Record<number, SetEntry>;
  /** Exercício substituto escolhido (null = o principal). */
  substituteId: string | null;
  completed: boolean;
  pain: number | null;
}

export type RunState = Record<string, ItemState>;

const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

export function initialRunState(session: AppTrainingSession): RunState {
  const state: RunState = {};
  for (const item of session.workout.items) {
    const log = session.items.find((l) => l.item_id === item.id);
    const sets: Record<number, SetEntry> = {};
    for (const target of setTargets(item)) {
      const logged = log?.sets.find((s) => s.set_index === target.index);
      sets[target.index] = logged
        ? { qty: str(logged.quantity_value), load: str(logged.load_value), done: true }
        : { qty: str(target.defaultQuantity), load: str(target.defaultLoad), done: false };
    }
    state[item.id] = {
      sets,
      substituteId: log?.substitute ? log.exercise_id : null,
      completed: Boolean(log?.completed_at),
      pain: log?.pain_score ?? null,
    };
  }
  return state;
}

/** Reflete uma operação (enviada ou pendente) no estado da tela. */
export function applyOp(state: RunState, op: QueueOp): RunState {
  if (op.kind !== "log_set" && op.kind !== "complete_item") return state;
  const cur = state[op.itemId];
  if (!cur) return state;
  if (op.kind === "log_set") {
    return {
      ...state,
      [op.itemId]: {
        ...cur,
        substituteId: op.data.substitute_exercise_id,
        sets: { ...cur.sets, [op.setIndex]: { qty: str(op.data.quantity_value), load: str(op.data.load_value), done: true } },
      },
    };
  }
  return { ...state, [op.itemId]: { ...cur, substituteId: op.substituteId, completed: true, pain: op.pain } };
}

/** Exercício efetivamente em uso no item (principal ou substituto escolhido). */
export function currentExercise(item: AppItem, state: ItemState | undefined) {
  return item.substitutes.find((s) => s.id === state?.substituteId) ?? item.exercise;
}

/** Primeiro exercício ainda não concluído (abre sozinho na tela). */
export function firstOpenItem(items: AppItem[], state: RunState): string | null {
  return items.find((i) => !state[i.id]?.completed)?.id ?? null;
}

/** Série atual do exercício: a primeira ainda não feita (null = todas feitas). */
export function currentSetIndex(item: AppItem, state: ItemState | undefined): number | null {
  return setTargets(item).find((t) => !state?.sets[t.index]?.done)?.index ?? null;
}

/** Próximo exercício não concluído depois de `fromId` (com volta ao começo); null = todos concluídos. */
export function nextOpenItem(items: AppItem[], state: RunState, fromId: string | null): string | null {
  const start = fromId ? items.findIndex((i) => i.id === fromId) : -1;
  for (let k = 1; k <= items.length; k++) {
    const it = items[(start + k + items.length) % items.length];
    if (!state[it.id]?.completed) return it.id;
  }
  return null;
}

/** Linha compacta da série feita: "10 reps · 42,5 kg". */
export function doneSetText(unitSuffix: string, entry: SetEntry, loadUnit: string): string {
  return [entry.qty && `${entry.qty}${unitSuffix ? ` ${unitSuffix}` : ""}`, entry.load && `${entry.load} ${loadUnit}`].filter(Boolean).join(" · ") || "✓";
}
