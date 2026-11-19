"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createClient } from "@/lib/db/client";
import { formatDate } from "@/lib/format";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { undoDeadline, canUndo } from "../undo";
import type { ImportBatchSummary } from "../queries";

const t = messages.importer.history;

/** Importações dos últimos 30 dias com "Desfazer" (até 7 dias; arquiva só quem não teve atividade). */
export function ImportHistory({ batches, now }: { batches: ImportBatchSummary[]; now: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nowMs = Date.parse(now);

  const undo = (id: string) =>
    startTransition(async () => {
      const { data, error } = await supabase.rpc("undo_import_batch", { p_batch_id: id });
      if (error) {
        toast.error(dbErrorMessage(error));
        return;
      }
      const r = (data ?? {}) as { archived?: number; kept?: number };
      toast.success(t.undoDone(r.archived ?? 0, r.kept ?? 0));
      setConfirm(null);
      router.refresh();
    });

  return (
    <section aria-labelledby="import-history" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h2 id="import-history" className="text-[15px] font-semibold text-ink">
        {t.title}
      </h2>
      {batches.length === 0 ? (
        <p className="text-[13px] text-ink-3">{t.empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {batches.map((b) => (
            <li key={b.id} className="flex flex-col gap-2 py-2.5 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-ink">
                  {formatDate(b.createdAt)} · {b.sourceLabel}
                </p>
                <p className="text-xs text-ink-3">
                  {b.undoneAt ? t.undone(b.archived ?? 0, b.kept ?? 0) : t.row(b.created, b.rejected)}
                  {canUndo(b, nowMs) && ` · ${t.undoUntil(formatDate(undoDeadline(b.createdAt)))}`}
                </p>
              </div>
              {canUndo(b, nowMs) && (
                <Button type="button" size="sm" variant="outline" className="self-start sm:self-center" onClick={() => setConfirm(b.id)}>
                  {t.undo}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t.undoTitle}
        description={t.undoBody}
        confirmLabel={t.undoConfirm}
        destructive
        pending={pending}
        onConfirm={() => confirm && undo(confirm)}
      />
    </section>
  );
}
