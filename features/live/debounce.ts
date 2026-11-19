/**
 * Agendador das recargas do painel AO VIVO disparadas pelo Realtime: cada série registrada gera um evento, então uma
 * rajada vira UMA recarga, e duas recargas nunca ficam a menos de `minGapMs` (padrão 5 s) uma da outra — contando
 * também a recarga da busca periódica (`markFetched`). Lógica pura (relógio e timers injetáveis), testada em
 * tests/unit/live.test.ts.
 */
export interface RefetchDebouncer {
  /** Evento do Realtime: agenda uma recarga (junta com a que já estiver agendada). */
  trigger(): void;
  /** Uma recarga aconteceu por outro caminho (busca periódica, foco na aba): conta para o intervalo mínimo. */
  markFetched(): void;
  dispose(): void;
}

interface Options {
  minGapMs: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

export function createRefetchDebouncer(run: () => void, opts: Options): RefetchDebouncer {
  const now = opts.now ?? (() => Date.now());
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  let last = Number.NEGATIVE_INFINITY;
  let timer: unknown = null;
  let disposed = false;

  return {
    trigger() {
      if (disposed || timer !== null) return;
      // Sempre espera: mesmo sem recarga recente, o primeiro evento de uma rajada aguarda o intervalo, para juntar os
      // seguintes numa única recarga.
      const wait = Math.max(opts.minGapMs, last + opts.minGapMs - now());
      timer = setTimer(() => {
        timer = null;
        if (disposed) return;
        last = now();
        run();
      }, wait);
    },
    markFetched() {
      last = now();
    },
    dispose() {
      disposed = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}
