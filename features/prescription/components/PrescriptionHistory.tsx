"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/db/client";
import { formatDate, formatTime } from "@/lib/format";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { describeChange, type HistoryBatch } from "../prescription";

const t = messages.prescription.history;

/** Histórico de alterações da prescrição (PARTE A, item 4): quem, quando, antes → depois, com desfazer por lote. */
export function PrescriptionHistory({ batches }: { batches: HistoryBatch[] }) {
  const id = useId();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const undo = async (batchId: string) => {
    setBusy(batchId);
    try {
      const { error } = await supabase.rpc("undo_prescription_batch", { p_batch_id: batchId });
      if (error) return void toast.error(dbErrorMessage(error));
      toast.success(t.undoneToast);
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby={`${id}-t`} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <h2 id={`${id}-t`} className="text-[15px] font-semibold text-ink">{t.title}</h2>
      {batches.length === 0 ? (
        <p className="text-sm text-ink-2">{t.empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {batches.map((b) => (
            <li key={b.batchId} data-testid="history-batch" className="flex flex-col gap-1 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{t.source[b.source]}</p>
                  <p className="text-xs text-ink-3">{t.by(b.actorName, `${formatDate(b.createdAt)} ${formatTime(b.createdAt)}`)}</p>
                </div>
                {b.undoneAt ? (
                  <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-xs text-ink-3 ring-1 ring-line">{t.undone}</span>
                ) : b.itemGone ? (
                  <span className="shrink-0 text-xs text-ink-3">{t.gone}</span>
                ) : (
                  <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" disabled={busy !== null} onClick={() => void undo(b.batchId)}>
                    {t.undo}
                  </Button>
                )}
              </div>
              <ul className="text-xs text-ink-2">
                {b.changes.map((c, k) => (
                  <li key={k}>
                    <span className="font-medium text-ink">{c.workoutLabel} · {c.exerciseName}</span>: {describeChange(c)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
