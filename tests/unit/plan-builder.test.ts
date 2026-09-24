import { describe, expect, it } from "vitest";
import {
  emptyItem,
  emptyWorkout,
  fromSaved,
  groupItems,
  moveBlock,
  moveBlockTo,
  moveWithinGroup,
  nextLabel,
  normalizeGroups,
  parseNumber,
  setsFromSummary,
  toBlocks,
  ungroup,
  validateDraft,
  type ItemDraft,
  type PlanDraft,
  type SavedPrescription,
} from "@/features/plans/builder";
import { planPayloadSchema } from "@/features/plans/schemas";

const EX = "11111111-1111-4111-8111-111111111111";
const mk = (name: string, groupKey: string | null = null): ItemDraft => ({ ...emptyItem({ id: EX, name }), key: name, groupKey });
const names = (items: ItemDraft[]) => items.map((i) => i.exerciseName);
const groups = (items: ItemDraft[]) => items.map((i) => i.groupKey);

const pr = (patch: Partial<SavedPrescription>): SavedPrescription => ({
  quantityUnit: "reps",
  quantityMin: null,
  quantityMax: null,
  quantityNote: null,
  intensityType: null,
  intensityValue: null,
  speed: null,
  tempo: null,
  restMin: null,
  restMax: null,
  ...patch,
});

function draft(items: ItemDraft[], extra: Partial<PlanDraft> = {}): PlanDraft {
  return {
    id: null,
    studentId: null,
    name: "Treino",
    goal: "",
    level: "",
    startsOn: "",
    endsOn: "",
    noEnd: false,
    plannedSessions: "",
    trainerId: "",
    notes: "",
    workouts: [{ key: "w1", label: "A", name: "", notes: "", items }],
    ...extra,
  };
}

describe("blocos e movimentação", () => {
  const items = [mk("a"), mk("b", "g1"), mk("c", "g1"), mk("d")];

  it("agrupamento forma um bloco", () => {
    expect(toBlocks(items).map((b) => b.items.map((i) => i.key))).toEqual([["a"], ["b", "c"], ["d"]]);
  });

  it("move o agrupamento inteiro com ↑↓", () => {
    expect(names(moveBlock(items, "g1", -1))).toEqual(["b", "c", "a", "d"]);
    expect(names(moveBlock(items, "g1", 1))).toEqual(["a", "d", "b", "c"]);
    expect(names(moveBlock(items, "a", -1))).toEqual(["a", "b", "c", "d"]);
  });

  it("arrastar bloco para a posição de outro", () => {
    expect(names(moveBlockTo(items, "d", "a"))).toEqual(["d", "a", "b", "c"]);
    expect(names(moveBlockTo(items, "a", "d"))).toEqual(["b", "c", "d", "a"]);
  });

  it("reordena dentro do agrupamento, sem sair dele", () => {
    expect(names(moveWithinGroup(items, "c", -1))).toEqual(["a", "c", "b", "d"]);
    expect(names(moveWithinGroup(items, "b", -1))).toEqual(["a", "b", "c", "d"]);
    expect(names(moveWithinGroup(items, "a", 1))).toEqual(["a", "b", "c", "d"]);
  });
});

describe("agrupar / desagrupar", () => {
  it("agrupa itens em sequência com chave nova válida", () => {
    const r = groupItems([mk("a"), mk("b"), mk("c")], new Set(["a", "b"]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items[0].groupKey).toMatch(/^[A-Za-z0-9_-]{1,20}$/);
    expect(r.items[0].groupKey).toBe(r.items[1].groupKey);
    expect(r.items[2].groupKey).toBeNull();
  });

  it("recusa seleção com intervalo ou de 1 item", () => {
    expect(groupItems([mk("a"), mk("b"), mk("c")], new Set(["a", "c"])).ok).toBe(false);
    expect(groupItems([mk("a"), mk("b")], new Set(["a"])).ok).toBe(false);
  });

  it("agrupar o meio de um grupo divide o restante corretamente", () => {
    const items = [mk("a", "g"), mk("b", "g"), mk("c", "g"), mk("d", "g")];
    const r = groupItems(items, new Set(["b", "c"]));
    if (!r.ok) throw new Error(r.error);
    // a e d ficaram isolados (1 item) → sem agrupamento
    expect(r.items[0].groupKey).toBeNull();
    expect(r.items[3].groupKey).toBeNull();
    expect(r.items[1].groupKey).toBe(r.items[2].groupKey);
  });

  it("normaliza sequências repetidas da mesma chave", () => {
    const out = normalizeGroups([mk("a", "g"), mk("b", "g"), mk("x"), mk("c", "g"), mk("d", "g")]);
    expect(out[0].groupKey).toBe("g");
    expect(out[3].groupKey).not.toBe("g");
    expect(out[3].groupKey).toBe(out[4].groupKey);
  });

  it("desagrupa", () => {
    expect(groups(ungroup([mk("a", "g"), mk("b", "g")], "g"))).toEqual([null, null]);
  });
});

describe("validação e payload", () => {
  it("aceita 8–12 reps, cadência 30X0, RPE 7,5, pausa 60–90, carga 12,5 kg e séries detalhadas (copiam a prescrição)", () => {
    const it: ItemDraft = { ...mk("a"), qtyMin: "8", qtyMax: "12", speedMode: "tempo", tempo: "30x0", intensityType: "rpe", intensityValue: "7,5", loadValue: "12,5", restMin: "60", restMax: "90" };
    it.setsDetail = setsFromSummary({ ...it, sets: "2" });
    const r = validateDraft(draft([it]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const item = r.payload.workouts[0].items[0];
    expect(item).toMatchObject({
      quantity_unit: "reps", quantity_min: 8, quantity_max: 12, tempo: "30X0", speed: null,
      intensity_type: "rpe", intensity_value: 7.5, load_value: 12.5, load_unit: "kg", rest_min: 60, rest_max: 90,
    });
    expect(item.sets_detail).toHaveLength(2);
    expect(item.sets_detail[0]).toMatchObject({ set_type: "work", quantity_min: 8, quantity_max: 12, tempo: "30X0", intensity_value: 7.5, load_value: 12.5, rest_max: 90 });
  });

  it("unidade muda a validação: até a falha não envia quantidade; reps inteiras; segundos aceitam decimal", () => {
    const failure = validateDraft(draft([{ ...mk("a"), quantityUnit: "failure", qtyMin: "10" }]));
    expect(failure.ok && failure.payload.workouts[0].items[0]).toMatchObject({ quantity_unit: "failure", quantity_min: null, quantity_max: null });
    const frac = validateDraft(draft([{ ...mk("a"), qtyMin: "8,5", qtyMax: "" }]));
    expect(!frac.ok && frac.errors["a.qtyMin"]).toBeTruthy();
    const km = validateDraft(draft([{ ...mk("a"), quantityUnit: "km", qtyMin: "1,5", qtyMax: "" }]));
    expect(km.ok).toBe(true);
  });

  it("velocidade por preset exclui a cadência (e vice-versa) pelo modo", () => {
    const preset = validateDraft(draft([{ ...mk("a"), speedMode: "preset", speed: "slow", tempo: "3010" }]));
    expect(preset.ok && preset.payload.workouts[0].items[0]).toMatchObject({ speed: "slow", tempo: null });
  });

  it("carga vazia não envia unidade; texto livre sozinho é aceito", () => {
    const r = validateDraft(draft([{ ...mk("a"), loadValue: "", loadText: "moderada" }]));
    expect(r.ok && r.payload.workouts[0].items[0]).toMatchObject({ load_value: null, load_unit: null, load_text: "moderada" });
  });

  it.each([
    ["tempo", { speedMode: "tempo" as const, tempo: "301" }],
    ["intensityValue", { intensityType: "rpe" as const, intensityValue: "11" }],
    ["intensityValue", { intensityType: "pct_1rm" as const, intensityValue: "" }],
    ["restMin", { restMin: "1000" }],
    ["restMax", { restMin: "90", restMax: "60" }],
    ["qtyMax", { qtyMin: "12", qtyMax: "8" }],
    ["sets", { sets: "0" }],
    ["loadValue", { loadValue: "abc" }],
    ["qtyNote", { qtyNote: "x".repeat(41) }],
  ])("erro no campo %s aponta para o item", (field, patch) => {
    const r = validateDraft(draft([{ ...mk("a"), ...patch }]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors)).toContain(`a.${field}`);
  });

  it("datas: formato BR, fim depois do início", () => {
    const ok = validateDraft(draft([], { startsOn: "01/10/2026", endsOn: "30/11/2026" }));
    expect(ok.ok && [ok.payload.starts_on, ok.payload.ends_on]).toEqual(["2026-10-01", "2026-11-30"]);
    const bad = validateDraft(draft([], { startsOn: "01/10/2026", endsOn: "01/09/2026" }));
    expect(!bad.ok && bad.errors["plan.endsOn"]).toBeTruthy();
    const invalid = validateDraft(draft([], { startsOn: "31/02/2026" }));
    expect(!invalid.ok && invalid.errors["plan.startsOn"]).toBeTruthy();
  });

  it("schema recusa agrupamento não contíguo (mesma regra do banco)", () => {
    const payload = {
      id: null,
      student_id: null,
      name: "X1",
      goal: null,
      level: null,
      starts_on: null,
      ends_on: null,
      notes: null,
      workouts: [
        {
          label: "A",
          name: null,
          notes: null,
          items: ["g", null, "g"].map((g) => ({
            exercise_id: EX,
            group_key: g,
            sets: 3,
            quantity_unit: "reps",
            quantity_min: 10,
            quantity_max: null,
            quantity_note: null,
            intensity_type: null,
            intensity_value: null,
            speed: null,
            tempo: null,
            rest_min: null,
            rest_max: null,
            load_value: null,
            load_unit: null,
            load_text: null,
            tip: null,
            substitutes: [],
            method_id: null,
            objective_id: null,
            sets_detail: [],
          })),
        },
      ],
    };
    expect(planPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it("parseNumber", () => {
    expect([parseNumber(""), parseNumber("12,5"), parseNumber("7"), Number.isNaN(parseNumber("1e3"))]).toEqual([null, 12.5, 7, true]);
  });

  it("ida e volta: salvo → rascunho → payload preserva agrupamentos e séries", () => {
    const d = fromSaved({
      id: EX,
      studentId: null,
      name: "Modelo",
      goal: null,
      level: "iniciante",
      startsOn: "2026-10-01",
      endsOn: null,
      noEnd: false,
      plannedSessions: 24,
      trainerId: null,
      notes: null,
      workouts: [
        {
          label: "A",
          name: null,
          notes: null,
          items: [
            { exerciseId: EX, exerciseName: "x", groupKey: "bi1", sets: 3, loadValue: 12.5, loadUnit: "kg", loadText: null, prescription: pr({ quantityMin: 10, intensityType: "rpe", intensityValue: 8, restMin: 60 }), tip: null, substitutes: [], methodId: null, objectiveId: null, setsDetail: [] },
            {
              exerciseId: EX, exerciseName: "y", groupKey: "bi1", sets: null, loadValue: null, loadUnit: null, loadText: null, prescription: pr({ tempo: "3010" }), tip: null, substitutes: [], methodId: null, objectiveId: null,
              setsDetail: [{ setType: "warmup", loadValue: null, loadUnit: null, loadText: "leve", prescription: pr({ quantityMin: 12, restMin: 45, restMax: 60 }) }],
            },
          ],
        },
      ],
    });
    expect(d.startsOn).toBe("01/10/2026");
    expect(d.workouts[0].items[0].loadValue).toBe("12,5");
    const r = validateDraft(d);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.workouts[0].items.map((i) => i.group_key)).toEqual(["bi1", "bi1"]);
    expect(r.payload.workouts[0].items[0]).toMatchObject({ quantity_min: 10, intensity_type: "rpe", intensity_value: 8, rest_min: 60 });
    expect(r.payload.workouts[0].items[1]).toMatchObject({ tempo: "3010", speed: null });
    expect(r.payload.workouts[0].items[1].sets_detail[0]).toMatchObject({ set_type: "warmup", load_text: "leve", quantity_min: 12, rest_min: 45, rest_max: 60 });
  });

  it("rótulos das divisões", () => {
    const ws = [emptyWorkout([])];
    expect(ws[0].label).toBe("A");
    expect(nextLabel([...ws, { ...emptyWorkout(ws), label: "C" }])).toBe("B");
  });
});

describe("situação do plano", async () => {
  const { daysUntil, planSituation, planPeriod } = await import("@/features/plans/format");
  it("dias civis até o fim", () => {
    expect(daysUntil("2026-10-10", "2026-10-03")).toBe(7);
    expect(planSituation("2026-10-09", "2026-10-03")).toEqual({ kind: "soon", label: "Vence em 6 dias" });
    expect(planSituation("2026-10-03", "2026-10-03")?.label).toBe("Vence hoje");
    expect(planSituation("2026-10-02", "2026-10-03")?.kind).toBe("expired");
    expect(planSituation("2026-10-10", "2026-10-03")?.kind).toBe("ok");
  });
  it("período", () => {
    expect(planPeriod("2026-10-01", "2026-11-30")).toBe("01/10/2026 – 30/11/2026");
    expect(planPeriod(null, null)).toBe("Sem período definido");
  });
});

describe("formatação para impressão", async () => {
  const { formatRest, formatLoad, formatDecimal } = await import("@/features/plans/format");
  it("descanso", () => {
    expect([formatRest(null), formatRest(45), formatRest(60), formatRest(90), formatRest(125)]).toEqual([null, "45 s", "1 min", "1 min 30 s", "2 min 5 s"]);
  });
  it("carga", () => {
    expect(formatLoad(12.5, "kg", null)).toBe("12,5 kg");
    expect(formatLoad(null, null, "moderada")).toBe("moderada");
    expect(formatLoad(40, "lb", "barra W")).toBe("40 lb · barra W");
    expect(formatLoad(null, null, "  ")).toBeNull();
    expect(formatDecimal(7.5)).toBe("7,5");
  });
});

describe("cabeçalho do plano (2.8.1)", () => {
  it("sem expiração: payload sem fim e sem erro de fim antes do início", () => {
    const r = validateDraft(draft([], { startsOn: "01/10/2026", endsOn: "01/09/2026", noEnd: true, plannedSessions: "36" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload).toMatchObject({ no_end: true, ends_on: null, planned_sessions: 36, trainer_id: null });
  });
  it("sessões previstas: 1–500, inteiras", () => {
    for (const bad of ["0", "501", "2,5", "abc"]) {
      const r = validateDraft(draft([], { plannedSessions: bad }));
      expect(!r.ok && r.errors["plan.plannedSessions"]).toBeTruthy();
    }
  });
  it("professor do plano vai no payload; vazio = padrão do servidor", () => {
    const T = "22222222-2222-4222-8222-222222222222";
    const r = validateDraft(draft([], { trainerId: T }));
    expect(r.ok && r.payload.trainer_id).toBe(T);
  });
  it("ida e volta preserva sem expiração, sessões e professor", async () => {
    const { fromSaved } = await import("@/features/plans/builder");
    const d = fromSaved({ id: EX, studentId: EX, name: "P", goal: null, level: null, startsOn: "2026-10-01", endsOn: null, noEnd: true, plannedSessions: 12, trainerId: EX, notes: null, workouts: [] });
    expect([d.noEnd, d.plannedSessions, d.trainerId, d.endsOn]).toEqual([true, "12", EX, ""]);
  });
});

describe("item do plano (2.8.2)", () => {
  const SUB = "33333333-3333-4333-8333-333333333333";
  it("dica saneada, substitutos, método e objetivo no payload", () => {
    const it = { ...mk("a"), tip: "<b>**Coluna**</b> neutra", substitutes: [{ id: SUB, name: "Alt" }], methodId: SUB, objectiveId: "" };
    const r = validateDraft(draft([it]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.workouts[0].items[0]).toMatchObject({ tip: "**Coluna** neutra", substitutes: [SUB], method_id: SUB, objective_id: null });
  });
  it("substituto igual ao principal, repetido ou 4+ é recusado", () => {
    const same = validateDraft(draft([{ ...mk("a"), substitutes: [{ id: EX, name: "x" }] }]));
    expect(!same.ok && same.errors["a.substitutes"]).toBeTruthy();
    const four = ["1", "2", "3", "4"].map((n) => ({ id: `4444444${n}-4444-4444-8444-444444444444`, name: n }));
    const many = validateDraft(draft([{ ...mk("a"), substitutes: four }]));
    expect(!many.ok && many.errors["a.substitutes"]).toBeTruthy();
  });
});

describe("menu da série (2.8.3)", async () => {
  const { duplicateSet, moveSet, setsFromSummary: gen } = await import("@/features/plans/builder");
  it("duplicar logo abaixo, mover e limite de 20", () => {
    const base = gen({ ...mk("a"), sets: "3" }).map((s, i) => ({ ...s, key: `s${i}`, qtyMin: String(i + 1) }));
    const dup = duplicateSet(base, "s1");
    expect(dup.map((s) => s.qtyMin)).toEqual(["1", "2", "2", "3"]);
    expect(moveSet(base, "s0", 1).map((s) => s.key)).toEqual(["s1", "s0", "s2"]);
    expect(moveSet(base, "s0", -1)).toBe(base);
    const twenty = gen({ ...mk("a"), sets: "20" });
    expect(duplicateSet(twenty, twenty[0].key)).toHaveLength(20);
  });
});
