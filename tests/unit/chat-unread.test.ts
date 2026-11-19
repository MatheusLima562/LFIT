import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUnreadScheduler } from "@/features/chat/unread";

describe("createUnreadScheduler", () => {
  let visible = true;
  let calls = 0;
  let resolveRun: (() => void) | null = null;
  const run = () => {
    calls++;
    return new Promise<void>((r) => (resolveRun = r));
  };
  const make = () => createUnreadScheduler(run, { delayMs: 500, minIntervalMs: 2000, visible: () => visible });
  const finish = async () => {
    resolveRun?.();
    resolveRun = null;
    await vi.advanceTimersByTimeAsync(0);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    visible = true;
    calls = 0;
    resolveRun = null;
  });
  afterEach(() => vi.useRealTimers());

  it("junta uma rajada de pedidos numa busca só", async () => {
    const s = make();
    for (let i = 0; i < 10; i++) s.request();
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toBe(1);
  });

  it("respeita o intervalo mínimo entre buscas, sem perder o último pedido", async () => {
    const s = make();
    s.request();
    await vi.advanceTimersByTimeAsync(500);
    await finish();
    s.request();
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(2);
  });

  it("pedido durante a busca vira uma busca logo depois (nunca duas ao mesmo tempo)", async () => {
    const s = make();
    s.request();
    await vi.advanceTimersByTimeAsync(500);
    s.request();
    s.request();
    expect(calls).toBe(1);
    await finish();
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toBe(2);
  });

  it("não busca com a aba oculta", async () => {
    const s = make();
    visible = false;
    s.request();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toBe(0);
    visible = true;
    s.request();
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toBe(1);
  });

  it("cancelar descarta o agendado e o pedido pendente", async () => {
    const s = make();
    s.request();
    s.cancel();
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toBe(0);
    s.request();
    await vi.advanceTimersByTimeAsync(500);
    s.request();
    s.cancel();
    await finish();
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toBe(1);
  });

  it("falha na busca não trava as próximas", async () => {
    let failures = 0;
    const s = createUnreadScheduler(
      () => {
        failures++;
        return Promise.reject(new Error("rede"));
      },
      { delayMs: 0, minIntervalMs: 0, visible: () => true },
    );
    s.request();
    await vi.advanceTimersByTimeAsync(0);
    s.request();
    await vi.advanceTimersByTimeAsync(0);
    expect(failures).toBe(2);
  });
});
