/**
 * Edição rápida da prescrição (PARTE A) — lógica pura: leitura defensiva das RPCs, regras da sugestão
 * "Atualizar prescrição para X?", passos do +/− e progressão em lote. Toda gravação passa por
 * `apply_prescription_changes` com o valor ANTIGO esperado (o banco recusa se o item mudou no meio).
 */
export type Field = "load_value" | "sets" | "quantity_min" | "quantity_max";
export type LoadUnit = "kg" | "lb";

/** `type` (não `interface`) para caber no `Json` das RPCs. */
export type Change = {
  item_id: string;
  field: Field;
  old: number | null;
  new: number;
  unit?: LoadUnit;
};

export interface QuickItem {
  id: string;
  exerciseName: string;
  sets: number | null;
  quantityMin: number | null;
  quantityMax: number | null;
  quantityUnit: string;
  loadValue: number | null;
  loadUnit: LoadUnit | null;
  loadText: string | null;
  detailed: boolean;
}

export interface QuickWorkout {
  id: string;
  label: string;
  name: string | null;
  items: QuickItem[];
}

/** Arredonda para 2 casas (evita 42.50000001). */
export const r2 = (n: number) => Math.round(n * 100) / 100;

/** Múltiplo mais próximo do passo (ex.: 44,1 com passo 2,5 → 45). */
export const roundToStep = (value: number, step: number) => r2(Math.round(value / step) * step);

/** O item aceita edição rápida de carga? (sem séries detalhadas e sem carga em texto). */
export const loadEditable = (i: QuickItem) => !i.detailed && i.loadText === null;
/** O item aceita +/− de repetições? (em repetições, sem séries detalhadas). */
export const repsEditable = (i: QuickItem) => !i.detailed && i.quantityUnit === "reps" && i.quantityMin !== null;
export const setsEditable = (i: QuickItem) => !i.detailed;

/** +/− carga: um passo a partir do valor atual (sem carga + "+" → um passo). Nunca negativa. */
export function stepLoad(i: QuickItem, step: number, dir: 1 | -1): Change[] {
  if (!loadEditable(i)) return [];
  const cur = i.loadValue;
  const next = cur === null ? (dir > 0 ? r2(step) : null) : r2(Math.max(0, cur + dir * step));
  if (next === null || next === cur || next > 1000) return [];
  return [{ item_id: i.id, field: "load_value", old: cur, new: next, unit: i.loadUnit ?? "kg" }];
}

/** +/− repetições: valor fixo muda 1; faixa (8–10) anda inteira (9–11). Mínimo 1, máximo 300. */
export function stepReps(i: QuickItem, dir: 1 | -1): Change[] {
  if (!repsEditable(i)) return [];
  const min = i.quantityMin!;
  const max = i.quantityMax;
  const nmin = min + dir;
  if (nmin < 1 || nmin > 300) return [];
  const out: Change[] = [{ item_id: i.id, field: "quantity_min", old: min, new: nmin }];
  if (max !== null && max !== min) {
    const nmax = max + dir;
    if (nmax > 300) return [];
    out.push({ item_id: i.id, field: "quantity_max", old: max, new: nmax });
  } else if (max !== null) {
    out.push({ item_id: i.id, field: "quantity_max", old: max, new: nmin });
  }
  // Ordem segura para o banco conferir a faixa só no fim (máximo ≥ mínimo).
  return out;
}

/** +/− séries (1 a 20). */
export function stepSets(i: QuickItem, dir: 1 | -1): Change[] {
  if (!setsEditable(i)) return [];
  const cur = i.sets ?? 0;
  const next = cur + dir;
  if (next < 1 || next > 20 || next === cur) return [];
  return [{ item_id: i.id, field: "sets", old: i.sets, new: next }];
}

/** Aplica mudanças a uma cópia do item (prévia local enquanto o banco confirma). */
export function applyLocal(i: QuickItem, changes: Change[]): QuickItem {
  const out = { ...i };
  for (const c of changes) {
    if (c.item_id !== i.id) continue;
    if (c.field === "load_value") {
      out.loadValue = c.new;
      out.loadUnit = out.loadUnit ?? c.unit ?? "kg";
    } else if (c.field === "sets") out.sets = c.new;
    else if (c.field === "quantity_min") out.quantityMin = c.new;
    else out.quantityMax = c.new;
  }
  return out;
}

/**
 * Junta mudanças acumuladas no mesmo item (vários toques seguidos viram UMA gravação): o "old" é o do primeiro toque
 * (o que o banco tem) e o "new" é o do último. Campos que voltaram ao valor original saem.
 */
export function mergeChanges(pending: Change[]): Change[] {
  const byKey = new Map<string, Change>();
  for (const c of pending) {
    const k = `${c.item_id}:${c.field}`;
    const prev = byKey.get(k);
    byKey.set(k, prev ? { ...prev, new: c.new } : c);
  }
  return [...byKey.values()].filter((c) => c.old !== c.new);
}

// --- Progressão em lote ---------------------------------------------------------------------------------------------
export interface BulkRow {
  itemId: string;
  exerciseName: string;
  before: number;
  after: number;
  unit: LoadUnit;
}

/**
 * +N% (ou −N%) de carga em todos os exercícios de um treino, arredondando para o passo. Fica de fora quem não tem carga
 * numérica (sem carga, carga em texto, séries detalhadas) e quem não mudaria depois do arredondamento.
 */
export function bulkProgression(w: QuickWorkout, percent: number, step: number): { rows: BulkRow[]; skipped: string[] } {
  const rows: BulkRow[] = [];
  const skipped: string[] = [];
  if (!Number.isFinite(percent) || percent === 0 || Math.abs(percent) > 50) return { rows, skipped: w.items.map((i) => i.exerciseName) };
  for (const i of w.items) {
    if (!loadEditable(i) || i.loadValue === null || i.loadValue <= 0) {
      skipped.push(i.exerciseName);
      continue;
    }
    const after = Math.max(0, roundToStep(i.loadValue * (1 + percent / 100), step));
    // O arredondamento nunca inverte o sentido (ex.: +5% de 1 kg com passo 2,5 daria 0) nem zera a carga numa redução.
    const wrongWay = percent > 0 ? after <= i.loadValue : after >= i.loadValue || after <= 0;
    if (wrongWay) {
      skipped.push(i.exerciseName);
      continue;
    }
    rows.push({ itemId: i.id, exerciseName: i.exerciseName, before: i.loadValue, after, unit: i.loadUnit ?? "kg" });
  }
  return { rows, skipped };
}

export const bulkChanges = (rows: BulkRow[]): Change[] =>
  rows.map((r) => ({ item_id: r.itemId, field: "load_value", old: r.before, new: r.after, unit: r.unit }));

// --- Sugestões "Atualizar prescrição para X?" -----------------------------------------------------------------------
export interface ReviewItem {
  itemId: string;
  workoutLabel: string;
  exerciseName: string;
  sets: number | null;
  quantityMin: number | null;
  quantityMax: number | null;
  quantityUnit: string;
  loadValue: number | null;
  loadUnit: LoadUnit | null;
  loadText: string | null;
  detailed: boolean;
  sessionId: string;
  sessionFinishedAt: string;
  logs: { loadValue: number | null; loadUnit: LoadUnit | null; quantityValue: number | null }[];
  dismissed: string[];
}

export interface Suggestion {
  key: string;
  kind: "load" | "reps";
  itemId: string;
  sessionId: string;
  sessionFinishedAt: string;
  workoutLabel: string;
  exerciseName: string;
  /** Valor sugerido, já em texto ("42,5 kg", "12 reps", "10–12 reps"). */
  target: string;
  current: string;
  changes: Change[];
}

/** Valor mais frequente (empate → o maior). */
export function mode(values: number[]): number | null {
  if (!values.length) return null;
  const count = new Map<number, number>();
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1);
  let best: number | null = null;
  let bestN = 0;
  for (const [v, n] of count) if (n > bestN || (n === bestN && best !== null && v > best)) [best, bestN] = [v, n];
  return best;
}

const num = (n: number) => String(r2(n)).replace(".", ",");
export const formatLoad = (v: number | null, u: LoadUnit | null) => (v === null ? "—" : `${num(v)} ${u ?? "kg"}`);
export const formatReps = (min: number | null, max: number | null) =>
  min === null ? "—" : max !== null && max !== min ? `${min}–${max} reps` : `${min} reps`;

/**
 * Compara o que foi registrado na sessão com a prescrição. Carga: valor mais usado nas séries (mesma unidade) diferente
 * do prescrito. Repetições: valor fixo diferente, ou faixa ultrapassada (a faixa anda, mantendo a largura). Nunca grava:
 * só devolve as mudanças que o personal pode aplicar com um toque.
 */
export function computeSuggestions(items: ReviewItem[]): Suggestion[] {
  const out: Suggestion[] = [];
  for (const i of items) {
    if (i.detailed) continue;
    if (i.loadText === null && !i.dismissed.includes("load_value")) {
      const unit = i.loadUnit ?? i.logs.find((l) => l.loadValue !== null)?.loadUnit ?? "kg";
      const loads = i.logs.filter((l) => l.loadValue !== null && (l.loadUnit ?? "kg") === unit).map((l) => r2(l.loadValue!));
      const m = mode(loads);
      if (m !== null && m !== i.loadValue && m <= 1000) {
        out.push({
          key: `${i.sessionId}:${i.itemId}:load`, kind: "load", itemId: i.itemId, sessionId: i.sessionId,
          sessionFinishedAt: i.sessionFinishedAt, workoutLabel: i.workoutLabel, exerciseName: i.exerciseName,
          target: formatLoad(m, unit), current: formatLoad(i.loadValue, i.loadUnit),
          changes: [{ item_id: i.itemId, field: "load_value", old: i.loadValue, new: m, unit }],
        });
      }
    }
    if (i.quantityUnit === "reps" && i.quantityMin !== null && !i.dismissed.includes("quantity")) {
      const q = mode(i.logs.map((l) => l.quantityValue).filter((v): v is number => v !== null && Number.isInteger(v) && v >= 1 && v <= 300));
      if (q === null) continue;
      const min = i.quantityMin;
      const max = i.quantityMax;
      const fixed = max === null || max === min;
      let changes: Change[] = [];
      let target = "";
      if (fixed && q !== min) {
        changes = [{ item_id: i.itemId, field: "quantity_min", old: min, new: q }];
        if (max !== null) changes.push({ item_id: i.itemId, field: "quantity_max", old: max, new: q });
        target = formatReps(q, null);
      } else if (!fixed && (q < min || q > max!)) {
        const width = max! - min;
        const [nmin, nmax] = q < min ? [q, q + width] : [Math.max(1, q - width), q];
        if (nmax <= 300) {
          changes = [
            ...(nmin !== min ? [{ item_id: i.itemId, field: "quantity_min" as const, old: min, new: nmin }] : []),
            ...(nmax !== max ? [{ item_id: i.itemId, field: "quantity_max" as const, old: max, new: nmax }] : []),
          ];
          target = formatReps(nmin, nmax);
        }
      }
      if (changes.length) {
        out.push({
          key: `${i.sessionId}:${i.itemId}:reps`, kind: "reps", itemId: i.itemId, sessionId: i.sessionId,
          sessionFinishedAt: i.sessionFinishedAt, workoutLabel: i.workoutLabel, exerciseName: i.exerciseName,
          target, current: formatReps(min, max), changes,
        });
      }
    }
  }
  return out;
}

/** Agrupa por sessão (mais recente primeiro): "Aplicar todas desta sessão". */
export function groupBySession(s: Suggestion[]): { sessionId: string; finishedAt: string; suggestions: Suggestion[] }[] {
  const map = new Map<string, { sessionId: string; finishedAt: string; suggestions: Suggestion[] }>();
  for (const x of s) {
    const g = map.get(x.sessionId) ?? { sessionId: x.sessionId, finishedAt: x.sessionFinishedAt, suggestions: [] };
    g.suggestions.push(x);
    map.set(x.sessionId, g);
  }
  return [...map.values()].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
}

// --- Leitura defensiva -------------------------------------------------------------------------------------------------
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const s = (v: unknown) => (typeof v === "string" ? v : "");
const unitOf = (v: unknown): LoadUnit | null => (v === "kg" || v === "lb" ? v : null);

export function parseReview(raw: unknown): ReviewItem[] {
  const items = (raw as { items?: unknown } | null)?.items;
  return (Array.isArray(items) ? items : []).flatMap((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    if (typeof o.item_id !== "string" || typeof o.session_id !== "string") return [];
    return [{
      itemId: o.item_id, workoutLabel: s(o.workout_label), exerciseName: s(o.exercise_name) || "—",
      sets: n(o.sets), quantityMin: n(o.quantity_min), quantityMax: n(o.quantity_max), quantityUnit: s(o.quantity_unit),
      loadValue: n(o.load_value), loadUnit: unitOf(o.load_unit), loadText: typeof o.load_text === "string" ? o.load_text : null,
      detailed: o.detailed === true, sessionId: o.session_id, sessionFinishedAt: s(o.session_finished_at),
      logs: (Array.isArray(o.logs) ? o.logs : []).map((l) => {
        const x = (l ?? {}) as Record<string, unknown>;
        return { loadValue: n(x.load_value), loadUnit: unitOf(x.load_unit), quantityValue: n(x.quantity_value) };
      }),
      dismissed: (Array.isArray(o.dismissed) ? o.dismissed : []).filter((d): d is string => typeof d === "string"),
    }];
  });
}

export interface HistoryBatch {
  batchId: string;
  createdAt: string;
  source: "quick" | "suggestion" | "bulk" | "ai" | "undo";
  actorName: string;
  undoneAt: string | null;
  itemGone: boolean;
  changes: { workoutLabel: string; exerciseName: string; field: Field; old: number | null; new: number | null; unit: string }[];
}

const SOURCES = ["quick", "suggestion", "bulk", "ai", "undo"] as const;
const FIELDS = ["load_value", "sets", "quantity_min", "quantity_max"] as const;

export function parseHistory(raw: unknown): HistoryBatch[] {
  return (Array.isArray(raw) ? raw : []).flatMap((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    if (typeof o.batch_id !== "string") return [];
    return [{
      batchId: o.batch_id, createdAt: s(o.created_at),
      source: (SOURCES as readonly unknown[]).includes(o.source) ? (o.source as HistoryBatch["source"]) : "quick",
      actorName: s(o.actor_name), undoneAt: typeof o.undone_at === "string" ? o.undone_at : null, itemGone: o.item_gone === true,
      changes: (Array.isArray(o.changes) ? o.changes : []).flatMap((c) => {
        const x = (c ?? {}) as Record<string, unknown>;
        if (!(FIELDS as readonly unknown[]).includes(x.field)) return [];
        return [{ workoutLabel: s(x.workout_label), exerciseName: s(x.exercise_name), field: x.field as Field, old: n(x.old), new: n(x.new), unit: s(x.unit) }];
      }),
    }];
  });
}

/** "40 kg → 42,5 kg", "3 → 4 séries", "8 → 10 reps (mín.)". */
export function describeChange(c: { field: Field; old: number | null; new: number | null; unit: string }): string {
  const v = (x: number | null) => (x === null ? "—" : num(x));
  if (c.field === "load_value") return `${v(c.old)} → ${v(c.new)} ${c.unit || "kg"}`;
  if (c.field === "sets") return `${v(c.old)} → ${v(c.new)} séries`;
  return `${v(c.old)} → ${v(c.new)} reps (${c.field === "quantity_min" ? "mín." : "máx."})`;
}
