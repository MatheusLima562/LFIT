/**
 * Agenda as buscas da contagem de não lidas: junta pedidos próximos numa busca só, respeita um intervalo mínimo entre
 * buscas, nunca roda duas ao mesmo tempo (um pedido durante a busca vira uma busca logo depois) e não busca com a aba
 * oculta — quem volta à aba pede de novo. Lógica pura (relógio e timers injetáveis), testada em
 * `tests/unit/chat-unread.test.ts`.
 */
export interface UnreadScheduler {
  /** Pede uma busca (Realtime, conversa marcada como lida, internet voltou, aba voltou). */
  request: () => void;
  /** Cancela o que estiver agendado (último selo saiu da tela). */
  cancel: () => void;
}

interface Options {
  /** Espera mínima antes de buscar: junta a rajada de eventos. */
  delayMs: number;
  /** Intervalo mínimo entre o início de duas buscas. */
  minIntervalMs: number;
  visible: () => boolean;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

export function createUnreadScheduler(run: () => Promise<void>, opts: Options): UnreadScheduler {
  const now = opts.now ?? Date.now;
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  let timer: unknown = null;
  let inFlight = false;
  let again = false;
  let lastStart = -Infinity;
  let cancelled = false;

  const request = () => {
    cancelled = false;
    if (!opts.visible()) return;
    if (inFlight) {
      again = true;
      return;
    }
    if (timer !== null) return;
    const wait = Math.max(opts.delayMs, lastStart + opts.minIntervalMs - now());
    timer = setTimer(() => {
      timer = null;
      inFlight = true;
      lastStart = now();
      void run()
        .catch(() => {})
        .finally(() => {
          inFlight = false;
          if (again && !cancelled) {
            again = false;
            request();
          }
        });
    }, wait);
  };

  const cancel = () => {
    cancelled = true;
    again = false;
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  return { request, cancel };
}
