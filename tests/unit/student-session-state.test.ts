import { describe, expect, it } from "vitest";
import { applyOp, currentExercise, firstOpenItem, initialRunState } from "@/features/student-app/session-state";
import { itemSummary, setTargets } from "@/features/student-app/format";
import type { AppItem, AppTrainingSession } from "@/features/student-app/types";

const ex = (id: string, name: string) => ({ id, name, instructions: null, equipment: null, video_url: null, video_path: null, poster_path: null });
const base = {
  quantity_unit: "reps" as const, quantity_min: 10, quantity_max: 12, quantity_note: null,
  load_value: 40, load_unit: "kg" as const, load_text: null, intensity: "RPE 8", speed: null, tempo: null, rest_min: 60, rest_max: 90,
};
const item = (id: string, extra: Partial<AppItem> = {}): AppItem => ({
  ...base, id, position: 0, group_key: null, sets: 3, method: null, tip: null, care_note: null,
  exercise: ex(`e-${id}`, `Exercício ${id}`), substitutes: [ex("sub", "Substituto")], sets_detail: [], ...extra,
});
const session = (items: AppItem[], logs: AppTrainingSession["items"] = []): AppTrainingSession => ({
  mode: "self",
  session: { id: "s", status: "in_progress", started_at: "", finished_at: null, plan_id: "p", workout_id: "w", workout_label: "A", workout_name: null, rpe: null, pain_checkin: null, feedback_note: null },
  workout: { id: "w", label: "A", name: null, notes: null, position: 0, items },
  items: logs,
});

describe("execução do treino (estado da tela)", () => {
  it("metas por série: 'séries × prescrição' ou as séries detalhadas", () => {
    expect(setTargets(item("a")).map((t) => t.index)).toEqual([1, 2, 3]);
    expect(itemSummary(item("a"))).toBe("3 × 10–12 reps · 40 kg · RPE 8 · 60–90 s");
    const detailed = item("b", { sets_detail: [{ ...base, position: 0, set_type: "warmup", quantity_min: 15, quantity_max: null, load_value: 20 }] });
    expect(setTargets(detailed)).toMatchObject([{ index: 1, setType: "warmup", defaultQuantity: 15, defaultLoad: 20 }]);
  });

  it("estado inicial pré-preenche a meta e reaproveita o que o servidor já registrou", () => {
    const st = initialRunState(
      session([item("a"), item("b")], [
        { item_id: "a", exercise_id: "sub", exercise_name: "Substituto", substitute: true, completed_at: "x", pain_score: 2,
          sets: [{ set_index: 1, exercise_id: "sub", quantity_value: 11, load_value: 42.5, load_unit: "kg", load_text: null }] },
      ]),
    );
    expect(st.a.sets[1]).toEqual({ qty: "11", load: "42,5", done: true });
    expect(st.a.sets[2]).toEqual({ qty: "12", load: "40", done: false });
    expect(st.a).toMatchObject({ substituteId: "sub", completed: true, pain: 2 });
    expect(firstOpenItem([item("a"), item("b")], st)).toBe("b");
    expect(currentExercise(item("a"), st.a).name).toBe("Substituto");
  });

  it("operações pendentes da fila aparecem na tela depois de recarregar sem internet", () => {
    let st = initialRunState(session([item("a")]));
    st = applyOp(st, { kind: "log_set", sessionId: "s", itemId: "a", setIndex: 2, data: { quantity_value: 9, load_value: 35, load_unit: "kg", load_text: null, substitute_exercise_id: null } });
    st = applyOp(st, { kind: "complete_item", sessionId: "s", itemId: "a", pain: 4, substituteId: null });
    expect(st.a.sets[2]).toEqual({ qty: "9", load: "35", done: true });
    expect(st.a).toMatchObject({ completed: true, pain: 4 });
  });
});
