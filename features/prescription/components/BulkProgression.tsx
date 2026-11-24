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

  const workout = workouts.find((w) => w.id === workoutId);
  const pct = Number(percent.replace(",", "."));
  const valid = Number.isFinite(pct) && pct !== 0 && Math.abs(pct) <= 50;
  const preview = workout && valid ? bulkProgression(workout, pct, loadStep) : null;

  const apply = async () => {
    if (!preview?.rows.length) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("apply_prescription_changes", { p_changes: bulkChanges(preview.rows), p_source: "bulk" });
      if (error) return void toast.error(dbErrorMessage(error));
      toast.success(t.applied);
      setShown(false);
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
          <select id={`${id}-w`} className={select} value={workoutId} onChange={(e) => { setWorkoutId(e.target.value); setShown(false); }}>
            {workouts.map((w) => <option key={w.id} value={w.id}>{messages.prescription.workoutTab(w.label)}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-p`} className="text-sm font-medium text-ink">{t.percent}</label>
          <Input id={`${id}-p`} inputMode="decimal" className="h-11" value={percent} onChange={(e) => { setPercent(e.target.value); setShown(false); }} />
        </div>
      </div>
      {!valid && <p role="alert" className="text-xs text-danger-ink">{t.invalid}</p>}
      <Button type="button" variant="outline" className="h-11 self-start" disabled={!valid} onClick={() => setShown(true)}>{t.preview}</Button>

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
