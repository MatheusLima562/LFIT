/**
 * Fila local do app do aluno (internet ruim na academia): cada registro vira uma operação na fila, salva no
 * navegador, e é reenviada em ordem quando a conexão volta. As RPCs são idempotentes (upsert), então reenviar é seguro.
 * Lógica pura (sem React nem Supabase) — testada em tests/unit/student-queue.test.ts.
 */

export type QueueOp =
  | {
      kind: "log_set";
      sessionId: string;
      itemId: string;
      setIndex: number;
      data: {
        quantity_value: number | null;
        load_value: number | null;
        load_unit: "kg" | "lb" | null;
        load_text: string | null;
        substitute_exercise_id: string | null;
      };
    }
  | { kind: "complete_item"; sessionId: string; itemId: string; pain: number | null; substituteId: string | null }
  | { kind: "pain_checkin"; sessionId: string; answer: "normal" | "ainda_incomoda" }
  | { kind: "finish"; sessionId: string; rpe: number | null; feedback: string | null };

/** Mesma chave = mesmo alvo no banco: a operação nova substitui a antiga ainda não enviada. */
export function opKey(op: QueueOp): string {
  switch (op.kind) {
    case "log_set":
      return `set:${op.itemId}:${op.setIndex}`;
    case "complete_item":
      return `item:${op.itemId}`;
    case "pain_checkin":
      return "checkin";
    case "finish":
      return "finish";
  }
}

export function enqueue(queue: QueueOp[], op: QueueOp): QueueOp[] {
  const key = opKey(op);
  return [...queue.filter((q) => opKey(q) !== key), op];
}

/** "ok" = gravado; "retry" = falha de rede (para a fila e tenta depois); { error } = recusado pelo banco (descarta). */
export type RunResult = "ok" | "retry" | { error: string };

export interface FlushResult {
  errors: string[];
  /** Parou por falta de conexão (sobrou fila). */
  offline: boolean;
}

/**
 * Envia em ordem, sempre o primeiro da fila ATUAL (`get`), para não perder o que for enfileirado durante o envio.
 * Gravado ou recusado → sai da fila (`set`); falha de rede → para e mantém o resto.
 */
export async function flush(
  get: () => QueueOp[],
  set: (queue: QueueOp[]) => void,
  run: (op: QueueOp) => Promise<RunResult>,
): Promise<FlushResult> {
  const errors: string[] = [];
  for (let op = get()[0]; op; op = get()[0]) {
    const result = await run(op);
    if (result === "retry") return { errors, offline: true };
    set(get().filter((q) => q !== op));
    if (result !== "ok") errors.push(result.error);
  }
  return { errors, offline: false };
}

const storageKey = (sessionId: string) => `lfit:aluno:fila:${sessionId}`;

/** Armazenamento do navegador pode falhar (aba anônima, cota): a fila continua em memória. */
export function loadQueue(sessionId: string): QueueOp[] {
  try {
    const raw = window.localStorage.getItem(storageKey(sessionId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as QueueOp[]) : [];
  } catch {
    return [];
  }
}

export function saveQueue(sessionId: string, queue: QueueOp[]) {
  try {
    if (queue.length) window.localStorage.setItem(storageKey(sessionId), JSON.stringify(queue));
    else window.localStorage.removeItem(storageKey(sessionId));
  } catch {
    // Sem armazenamento: segue só em memória.
  }
}

/** Erro de rede (sem código do Postgres) → tentar de novo; erro do banco (P0001, 42501…) → descartar. */
export function isNetworkError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return !error.code || /fetch|network|load failed/i.test(error.message ?? "");
}
