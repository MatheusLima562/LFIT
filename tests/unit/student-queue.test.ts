import { describe, expect, it } from "vitest";
import { enqueue, flush, isNetworkError, type QueueOp } from "@/features/student-app/queue";

const set = (setIndex: number, qty: number): QueueOp => ({
  kind: "log_set",
  sessionId: "s",
  itemId: "i1",
  setIndex,
  data: { quantity_value: qty, load_value: null, load_unit: null, load_text: null, substitute_exercise_id: null },
});

describe("fila local do app do aluno", () => {
  it("regravar a mesma série substitui a pendente (sem duplicar) e vai para o fim", () => {
    let q: QueueOp[] = [];
    q = enqueue(q, set(1, 10));
    q = enqueue(q, set(2, 10));
    q = enqueue(q, set(1, 12));
    expect(q.map((o) => (o.kind === "log_set" ? `${o.setIndex}:${o.data.quantity_value}` : o.kind))).toEqual(["2:10", "1:12"]);
  });

  it("envia em ordem; falha de rede para e guarda o resto; recusa do banco descarta e segue", async () => {
    let q: QueueOp[] = [set(1, 10), set(2, 10), set(3, 10)];
    const get = () => q;
    const put = (next: QueueOp[]) => (q = next);
    const sent: number[] = [];
    const r = await flush(get, put, async (op) => {
      if (op.kind === "log_set" && op.setIndex === 2) return "retry";
      if (op.kind === "log_set") sent.push(op.setIndex);
      return "ok";
    });
    expect(sent).toEqual([1]);
    expect(r).toEqual({ errors: [], offline: true });
    expect(q.map((o) => (o.kind === "log_set" ? o.setIndex : 0))).toEqual([2, 3]);

    const r2 = await flush(get, put, async (op) => (op.kind === "log_set" && op.setIndex === 2 ? { error: "SESSION_CLOSED" } : "ok"));
    expect(r2).toEqual({ errors: ["SESSION_CLOSED"], offline: false });
    expect(q).toEqual([]);
  });

  it("o que for enfileirado durante o envio não se perde (inclusive a regravação da série em envio)", async () => {
    let q: QueueOp[] = [set(1, 10)];
    const seen: string[] = [];
    await flush(
      () => q,
      (next) => (q = next),
      async (op) => {
        if (op.kind === "log_set") seen.push(`${op.setIndex}:${op.data.quantity_value}`);
        if (seen.length === 1) q = enqueue(enqueue(q, set(2, 8)), set(1, 11)); // chega no meio do envio
        return "ok";
      },
    );
    expect(seen).toEqual(["1:10", "2:8", "1:11"]);
    expect(q).toEqual([]);
  });

  it("erro de rede × erro do banco", () => {
    expect(isNetworkError({ message: "TypeError: Failed to fetch", code: "" })).toBe(true);
    expect(isNetworkError({ message: "PAIN_REQUIRED", code: "P0001" })).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});
