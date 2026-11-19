import { describe, expect, it } from "vitest";
import { createRefetchDebouncer } from "@/features/live/debounce";
import {
  attentionHref,
  attentionLabel,
  bannerMessage,
  clockOffset,
  durationLabel,
  parseHeartbeat,
  parseLiveBoard,
  progress,
  type AttentionEntry,
} from "@/features/live/live";

const NOW = Date.parse("2026-11-19T15:00:00Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

describe("durationLabel", () => {
  it("formata minutos e horas", () => {
    expect(durationLabel(minutesAgo(0), NOW)).toBe("agora");
    expect(durationLabel(minutesAgo(8), NOW)).toBe("8 min");
    expect(durationLabel(minutesAgo(60), NOW)).toBe("1 h");
    expect(durationLabel(minutesAgo(65), NOW)).toBe("1 h 05 min");
  });
  it("relógio adiantado no aparelho não vira tempo negativo", () => {
    expect(durationLabel(new Date(NOW + 120_000).toISOString(), NOW)).toBe("agora");
  });
  it("data inválida", () => {
    expect(durationLabel("x", NOW)).toBe("—");
  });
});

describe("clockOffset", () => {
  it("diferença entre banco e aparelho", () => {
    expect(clockOffset(new Date(NOW + 5000).toISOString(), NOW)).toBe(5000);
    expect(clockOffset("lixo", NOW)).toBe(0);
  });
});

describe("parseLiveBoard", () => {
  it("lê a resposta e descarta linhas malformadas", () => {
    const b = parseLiveBoard({
      enabled: true,
      can_configure: true,
      now: minutesAgo(0),
      live: [
        { session_id: "s1", student_id: "a1", first_name: "Ana", last_name: "Lima", workout_label: "A", started_at: minutesAgo(12), last_event_at: minutesAgo(1), done: 3, total: 6 },
        { session_id: null },
      ],
      attention: [
        { kind: "unanswered", student_id: "a2", first_name: "Bia", last_name: "Souza", since: minutesAgo(7) },
        { kind: "inventado", student_id: "a3", since: minutesAgo(1) },
      ],
    });
    expect(b?.live).toHaveLength(1);
    expect(b?.attention.map((a) => a.kind)).toEqual(["unanswered"]);
    expect(b?.canConfigure).toBe(true);
  });
  it("formato inesperado → null (o card some)", () => {
    expect(parseLiveBoard(null)).toBeNull();
    expect(parseLiveBoard({ live: [] })).toBeNull();
  });
  it("nenhum campo de saúde passa adiante, mesmo se vier", () => {
    const b = parseLiveBoard({
      enabled: true,
      live: [{ session_id: "s", student_id: "a", started_at: minutesAgo(1), last_event_at: minutesAgo(1), pain_score: 9 }],
      attention: [{ kind: "pain", student_id: "a", since: minutesAgo(1), pain_score: 9, feedback_note: "dor" }],
    });
    expect(JSON.stringify(b)).not.toMatch(/pain_score|feedback_note/);
  });
});

describe("atenção", () => {
  const base = { student_id: "a1", first_name: "Ana", last_name: "Lima", since: minutesAgo(22) };
  it("textos sem número de dor", () => {
    expect(attentionLabel({ ...base, kind: "stalled" }, NOW)).toBe("Treino parado há 22 min");
    expect(attentionLabel({ ...base, kind: "unanswered" }, NOW)).toBe("Mensagem sem resposta há 22 min");
    expect(attentionLabel({ ...base, kind: "pain" }, NOW)).not.toMatch(/\d/);
  });
  it("aviso de treino leva aos treinos; o resto à conversa", () => {
    const e = (kind: AttentionEntry["kind"]) => attentionHref({ ...base, kind });
    expect(e("pain")).toBe("/alunos/a1/treinos");
    expect(e("session_alert")).toBe("/alunos/a1/treinos");
    expect(e("unanswered")).toBe("/chat?aluno=a1");
    expect(e("stalled")).toBe("/chat?aluno=a1");
  });
});

describe("progress", () => {
  it("limita ao total", () => {
    expect(progress({ done: 3, total: 6 })).toEqual({ done: 3, total: 6, pct: 50 });
    expect(progress({ done: 9, total: 6 }).done).toBe(6);
    expect(progress({ done: 0, total: 0 }).pct).toBe(0);
  });
});

describe("aluno: batimento e banner", () => {
  it("aviso só com o ao vivo ligado", () => {
    expect(parseHeartbeat({ live_enabled: false, show_notice: true }).showNotice).toBe(false);
    expect(parseHeartbeat({ live_enabled: true, show_notice: true }).showNotice).toBe(true);
    expect(parseHeartbeat("x")).toEqual({ liveEnabled: false, showNotice: false, message: null });
  });
  it("banner mostra a mais recente não fechada", () => {
    const m1 = { id: "1", body: "oi", created_at: minutesAgo(5), sender_first_name: "Caio" };
    const m2 = { id: "2", body: "tudo bem?", created_at: minutesAgo(1), sender_first_name: "Caio" };
    expect(bannerMessage(m1, m2, new Set())?.id).toBe("2");
    expect(bannerMessage(null, m2, new Set(["2"]))).toBeNull();
    expect(bannerMessage(m2, m1, new Set())?.id).toBe("2");
  });
});

describe("debounce das recargas do Realtime", () => {
  /** Relógio e timers falsos: `advance` dispara os timers vencidos em ordem. */
  function fakeClock() {
    let now = 0;
    let seq = 0;
    const timers = new Map<number, { at: number; fn: () => void }>();
    return {
      now: () => now,
      setTimer: (fn: () => void, ms: number) => {
        const id = ++seq;
        timers.set(id, { at: now + ms, fn });
        return id;
      },
      clearTimer: (id: unknown) => void timers.delete(id as number),
      advance(ms: number) {
        const end = now + ms;
        for (;;) {
          const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
          if (!due) break;
          timers.delete(due[0]);
          now = due[1].at;
          due[1].fn();
        }
        now = end;
      },
    };
  }

  it("rajada de eventos vira uma recarga, depois de 5 s", () => {
    const c = fakeClock();
    const runs: number[] = [];
    const d = createRefetchDebouncer(() => runs.push(c.now()), { minGapMs: 5000, ...c });
    for (let i = 0; i < 30; i++) d.trigger();
    c.advance(4999);
    expect(runs).toEqual([]);
    c.advance(1);
    expect(runs).toEqual([5000]);
  });

  it("nunca duas recargas a menos de 5 s, contando a busca periódica", () => {
    const c = fakeClock();
    const runs: number[] = [];
    const d = createRefetchDebouncer(() => runs.push(c.now()), { minGapMs: 5000, ...c });
    d.trigger();
    c.advance(5000); // recarga em 5000
    d.trigger();
    c.advance(1000);
    d.trigger();
    c.advance(10_000); // próxima só em 10000 (5 s depois da anterior); relógio em 16000
    c.advance(1000);
    d.markFetched(); // busca periódica em 17000
    d.trigger();
    c.advance(20_000);
    expect(runs).toEqual([5000, 10_000, 22_000]);
    for (let i = 1; i < runs.length; i++) expect(runs[i] - runs[i - 1]).toBeGreaterThanOrEqual(5000);
  });

  it("dispose cancela a recarga agendada", () => {
    const c = fakeClock();
    const runs: number[] = [];
    const d = createRefetchDebouncer(() => runs.push(c.now()), { minGapMs: 5000, ...c });
    d.trigger();
    d.dispose();
    c.advance(10_000);
    d.trigger();
    c.advance(10_000);
    expect(runs).toEqual([]);
  });
});
