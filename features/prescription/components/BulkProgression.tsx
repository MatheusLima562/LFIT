"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/db/client";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { bulkChanges, bulkProgression, formatLoad, type QuickWorkout } from "../prescription";

const t = messages.prescription.bulk;
const select = "h-11 w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Progressão em lote (PARTE A, item 3): +N% de carga num treino, arredondado ao passo, com prévia antes de aplicar. */
export function BulkProgression({ workouts, loadStep }: { workouts: QuickWorkout[]; loadStep: number }) {
  const id = useId();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [workoutId, setWorkoutId] = useState(workouts[0]?.id ?? "");
  const [percent, setPercent] = useState("5");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);

  const pct = Number(percent.replace(",", "."));
  const valid = Number.isFinite(pct) && pct !== 0 && Math.abs(pct) <= 50;
  // Prévia sempre com os valores ATUAIS do banco (não os da tela, que podem estar defasados depois de um +/−).
  const [fresh, setFresh] = useState<QuickWorkout | null>(null);
  const workout = fresh ?? workouts.find((w) => w.id === workoutId);
  const preview = shown && fresh && valid ? bulkProgression(fresh, pct, loadStep) : null;

  const loadPreview = async () => {
    const base = workouts.find((w) => w.id === workoutId);
    if (!base) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("plan_workout_items")
        .select("id, sets, quantity_min, quantity_max, quantity_unit, load_value, load_unit, load_text")
        .eq("workout_id", workoutId);
      if (error) return void toast.error(dbErrorMessage(error));
      const byId = new Map((data ?? []).map((r) => [r.id, r]));
      setFresh({
        ...base,
        items: base.items.flatMap((i) => {
          const r = byId.get(i.id);
          if (!r) return [];
          return [{ ...i, sets: r.sets, quantityMin: r.quantity_min, quantityMax: r.quantity_max, quantityUnit: r.quantity_unit,
            loadValue: r.load_value === null ? null : Number(r.load_value), loadUnit: r.load_unit, loadText: r.load_text }];
        }),
      });
      setShown(true);
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!preview?.rows.length) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("apply_prescription_changes", { p_changes: bulkChanges(preview.rows), p_source: "bulk" });
      if (error) {
        // Mudou no meio (outra aba/pessoa): avisa, relê e refaz a prévia com os valores novos.
        toast.error(dbErrorMessage(error));
        router.refresh();
        await loadPreview();
        return;
      }
      toast.success(t.applied);
      setShown(false);
      setFresh(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={`${id}-t`} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div>
        <h2 id={`${id}-t`} className="text-[15px] font-semibold text-ink">{t.title}</h2>
        <p className="text-xs text-ink-3">{t.hint}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-w`} className="text-sm font-medium text-ink">{t.workout}</label>
          <select id={`${id}-w`} className={select} value={workoutId} onChange={(e) => { setWorkoutId(e.target.value); setShown(false); setFresh(null); }}>
            {workouts.map((w) => <option key={w.id} value={w.id}>{messages.prescription.workoutTab(w.label)}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-p`} className="text-sm font-medium text-ink">{t.percent}</label>
          <Input id={`${id}-p`} inputMode="decimal" className="h-11" value={percent} onChange={(e) => { setPercent(e.target.value); setShown(false); }} />
        </div>
      </div>
      {!valid && <p role="alert" className="text-xs text-danger-ink">{t.invalid}</p>}
      <Button type="button" variant="outline" className="h-11 self-start" disabled={!valid || busy} onClick={() => void loadPreview()}>{t.preview}</Button>

      {shown && preview && workout && (
        <div className="flex flex-col gap-2" data-testid="bulk-preview">
          <p className="text-sm font-medium text-ink">{t.previewTitle(workout.label, `${pct > 0 ? "+" : ""}${String(pct).replace(".", ",")}%`)}</p>
          {preview.rows.length === 0 ? (
            <p className="text-sm text-ink-2">{t.empty}</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-ink-3">
                <tr><th scope="col" className="py-1 font-medium">{messages.prescription.load}</th><th scope="col" className="py-1 font-medium">{t.before}</th><th scope="col" className="py-1 font-medium">{t.after}</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {preview.rows.map((r) => (
                  <tr key={r.itemId}>
                    <td className="py-1.5 pr-2 text-ink">{r.exerciseName}</td>
                    <td className="py-1.5 pr-2 tabular-nums text-ink-2">{formatLoad(r.before, r.unit)}</td>
                    <td className="py-1.5 font-semibold tabular-nums text-ink">{formatLoad(r.after, r.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {preview.skipped.length > 0 && <p className="text-xs text-ink-3">{t.skipped(preview.skipped.join(", "))}</p>}
          {preview.rows.length > 0 && (
            <Button type="button" className="h-11 self-start" disabled={busy} onClick={() => void apply()}>{t.apply(preview.rows.length)}</Button>
          )}
        </div>
      )}
    </section>
  );
}
