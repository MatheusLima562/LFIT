/**
 * Comando do personal com IA (PARTE B) — lógica pura. A IA só PROPÕE: a resposta é validada aqui contra a prescrição
 * atual (referência existe, item editável, campo permitido, limites) e vira `Change[]` para o personal confirmar; a
 * gravação é sempre `apply_prescription_changes` (origem "ai"). Ao provedor vão só nomes de exercícios e a prescrição.
 */
import type { Change, Field, LoadUnit } from "@/features/prescription/prescription";

export const COACH_MARKER = "LFIT_COACH_V1";

export interface CoachItem {
  ref: string;
  itemId: string;
  exercise: string;
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  quantityUnit: string;
  load: number | null;
  loadUnit: LoadUnit | null;
  editable: boolean;
}
export interface CoachWorkout { label: string; items: CoachItem[] }

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

export function parseCoachContext(raw: unknown): CoachWorkout[] {
  const ws = (raw as { workouts?: unknown } | null)?.workouts;
  return (Array.isArray(ws) ? ws : []).map((w) => {
    const o = (w ?? {}) as Record<string, unknown>;
    return {
      label: typeof o.label === "string" ? o.label : "?",
      items: (Array.isArray(o.items) ? o.items : []).flatMap((i) => {
        const x = (i ?? {}) as Record<string, unknown>;
        if (typeof x.ref !== "string" || typeof x.item_id !== "string") return [];
        return [{
          ref: x.ref, itemId: x.item_id, exercise: typeof x.exercise === "string" ? x.exercise : "—",
          sets: num(x.sets), repsMin: num(x.reps_min), repsMax: num(x.reps_max),
          quantityUnit: typeof x.quantity_unit === "string" ? x.quantity_unit : "", load: num(x.load),
          loadUnit: x.load_unit === "kg" || x.load_unit === "lb" ? x.load_unit : null, editable: x.editable === true,
        }];
      }),
    };
  });
}

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Tira o nome do aluno do texto antes de enviar (palavra inteira, sem acento/caixa) → "o aluno". Nomes com menos de 3
 * letras não são trocados (evita apagar "de", "da").
 */
export function redactNames(text: string, names: string[]): string {
  const words = names.flatMap((n) => n.split(/\s+/)).map((w) => w.trim()).filter((w) => w.length >= 3);
  if (!words.length) return text;
  const targets = new Set(words.map(strip));
  return text.replace(/[\p{L}]+/gu, (w) => (targets.has(strip(w)) ? "o aluno" : w));
}

/** Só o que o provedor precisa: referência, exercício e prescrição — nada de id, aluno, plano, saúde ou observações. */
export function promptPayload(workouts: CoachWorkout[]) {
  return workouts.map((w) => ({
    treino: w.label,
    exercicios: w.items.map((i) => ({
      ref: i.ref, exercicio: i.exercise, series: i.sets,
      repeticoes: i.quantityUnit === "reps" ? (i.repsMax !== null && i.repsMax !== i.repsMin ? `${i.repsMin}-${i.repsMax}` : i.repsMin) : null,
      carga: i.load, unidade: i.load === null ? null : (i.loadUnit ?? "kg"), editavel: i.editable,
    })),
  }));
}

export const COACH_SYSTEM = `${COACH_MARKER}
Você ajuda um personal trainer a ajustar a prescrição do treino atual de um aluno. Você NÃO grava nada: só propõe.
Responda SOMENTE com um JSON, sem texto fora dele, em um destes formatos:
{"type":"proposal","changes":[{"ref":"A1","field":"load","value":42.5}]}
{"type":"question","question":"pergunta curta em português"}
Regras:
- Use só as refs da prescrição recebida e só exercícios com "editavel": true.
- field: "load" (carga, na unidade do exercício), "sets" (séries), "reps" (repetições fixas), "reps_min" e "reps_max" (faixa).
- "value" é o valor NOVO final (não a diferença).
- Se o exercício, o treino ou a unidade estiverem ambíguos (ex.: o mesmo exercício em dois treinos e o comando não diz
  qual, ou "kg" pedido num exercício em "lb"), responda com "question". Não chute.
- Se o comando não for sobre a prescrição (séries, repetições, carga), responda com "question".`;

export function buildUserMessage(workouts: CoachWorkout[], command: string): string {
  return `Prescrição atual (JSON): ${JSON.stringify(promptPayload(workouts))}\nComando: ${command}`;
}

export type CoachReply =
  | { type: "proposal"; changes: { ref: string; field: string; value: unknown }[] }
  | { type: "question"; question: string }
  | { type: "invalid" };

/** Lê a resposta do modelo: o primeiro objeto JSON do texto. Qualquer outra coisa → inválida. */
export function parseReply(text: string): CoachReply {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { type: "invalid" };
  let o: unknown;
  try {
    o = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { type: "invalid" };
  }
  const r = (o ?? {}) as Record<string, unknown>;
  if (r.type === "question" && typeof r.question === "string" && r.question.trim()) {
    return { type: "question", question: r.question.trim().slice(0, 300) };
  }
  if (r.type === "proposal" && Array.isArray(r.changes)) {
    return {
      type: "proposal",
      changes: r.changes.map((c) => {
        const x = (c ?? {}) as Record<string, unknown>;
        return { ref: typeof x.ref === "string" ? x.ref : "", field: typeof x.field === "string" ? x.field : "", value: x.value };
      }),
    };
  }
  return { type: "invalid" };
}

export interface ProposalRow { workoutLabel: string; exercise: string; field: Field; before: number | null; after: number; unit: string }

/**
 * Valida a proposta contra a prescrição ATUAL. Qualquer item inválido (ref inexistente, item não editável, campo fora da
 * lista, valor fora do limite, faixa invertida, repetido) invalida a proposta inteira — nada é "consertado" em silêncio.
 */
export function validateProposal(
  reply: Extract<CoachReply, { type: "proposal" }>,
  workouts: CoachWorkout[],
): { ok: true; changes: Change[]; rows: ProposalRow[] } | { ok: false } {
  const byRef = new Map<string, { w: CoachWorkout; i: CoachItem }>();
  for (const w of workouts) for (const i of w.items) byRef.set(i.ref, { w, i });
  if (!reply.changes.length || reply.changes.length > 50) return { ok: false };
  const changes: Change[] = [];
  const rows: ProposalRow[] = [];
  const seen = new Set<string>();
  const finalReps = new Map<string, { min: number | null; max: number | null }>();

  const push = (w: CoachWorkout, i: CoachItem, field: Field, before: number | null, after: number, unit: string) => {
    const k = `${i.itemId}:${field}`;
    if (seen.has(k)) return false;
    seen.add(k);
    if (before === after) return true;
    changes.push({ item_id: i.itemId, field, old: before, new: after, ...(field === "load_value" ? { unit: (i.loadUnit ?? "kg") as LoadUnit } : {}) });
    rows.push({ workoutLabel: w.label, exercise: i.exercise, field, before, after, unit });
    return true;
  };

  for (const c of reply.changes) {
    const hit = byRef.get(c.ref);
    const v = typeof c.value === "number" && Number.isFinite(c.value) ? c.value : null;
    if (!hit || !hit.i.editable || v === null) return { ok: false };
    const { w, i } = hit;
    const reps = finalReps.get(i.itemId) ?? { min: i.repsMin, max: i.repsMax };
    if (c.field === "load") {
      if (v < 0 || v > 1000 || Math.round(v * 100) !== v * 100) return { ok: false };
      if (!push(w, i, "load_value", i.load, v, i.loadUnit ?? "kg")) return { ok: false };
    } else if (c.field === "sets") {
      if (!Number.isInteger(v) || v < 1 || v > 20) return { ok: false };
      if (!push(w, i, "sets", i.sets, v, "sets")) return { ok: false };
    } else if (c.field === "reps" || c.field === "reps_min" || c.field === "reps_max") {
      if (i.quantityUnit !== "reps" || i.repsMin === null || !Number.isInteger(v) || v < 1 || v > 300) return { ok: false };
      if (c.field === "reps" || c.field === "reps_min") {
        if (!push(w, i, "quantity_min", i.repsMin, v, "reps")) return { ok: false };
        reps.min = v;
      }
      if (c.field === "reps" && i.repsMax !== null) {
        if (!push(w, i, "quantity_max", i.repsMax, v, "reps")) return { ok: false };
        reps.max = v;
      }
      if (c.field === "reps_max") {
        if (!push(w, i, "quantity_max", i.repsMax, v, "reps")) return { ok: false };
        reps.max = v;
      }
      finalReps.set(i.itemId, reps);
    } else {
      return { ok: false };
    }
  }
  for (const r of finalReps.values()) if (r.max !== null && r.min !== null && r.max < r.min) return { ok: false };
  if (!changes.length) return { ok: false };
  return { ok: true, changes, rows };
}
