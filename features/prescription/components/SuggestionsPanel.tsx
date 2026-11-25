"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/db/client";
import { formatDate } from "@/lib/format";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { groupBySession, type Change, type Suggestion } from "../prescription";

const t = messages.prescription.suggestions;

/**
 * "Atualizar prescrição para X?" (PARTE A, item 1), agrupado por sessão (a mais recente primeiro = "no fim da sessão").
 * Um toque aplica (`apply_prescription_changes`, origem "suggestion", com o valor antigo esperado); "Manter" dispensa
 * para aquela sessão. Nunca aplica sozinho. Sem sugestões, o painel não aparece (a não ser com `showEmpty`).
 */
export function SuggestionsPanel({ suggestions, showEmpty = false }: { suggestions: Suggestion[]; showEmpty?: boolean }) {
  const id = useId();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const groups = groupBySession(suggestions);
  if (!groups.length && !showEmpty) return null;

  const apply = async (key: string, sessionId: string, changes: Change[]) => {
    setBusy(key);
    try {
      const { error } = await supabase.rpc("apply_prescription_changes", { p_changes: changes, p_source: "suggestion", p_session_id: sessionId });
      if (error) {
        toast.error(dbErrorMessage(error));
        router.refresh();
        return;
      }
      toast.success(t.applied);
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const keep = async (s: Suggestion) => {
    setBusy(s.key);
    try {
      const { error } = await supabase.rpc("dismiss_prescription_suggestion", { p_session_id: s.sessionId, p_item_id: s.itemId, p_field: s.kind === "load" ? "load_value" : "quantity" });
      if (error) return void toast.error(dbErrorMessage(error));
      toast.success(t.kept);
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby={`${id}-t`} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div>
        <h2 id={`${id}-t`} className="text-[15px] font-semibold text-ink">{t.title}</h2>
        <p className="text-xs text-ink-3">{t.hint}</p>
      </div>
      {!groups.length && <p className="text-sm text-ink-2">{t.none}</p>}
      {groups.map((g) => (
        <div key={g.sessionId} className="flex flex-col gap-2" data-testid="suggestion-group">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-ink">{t.session(formatDate(g.finishedAt))}</p>
            {g.suggestions.length > 1 && (
              <Button type="button" size="sm" className="h-9" disabled={busy !== null}
                onClick={() => void apply(`all:${g.sessionId}`, g.sessionId, g.suggestions.flatMap((s) => s.changes))}>
                {t.applyAll(g.suggestions.length)}
              </Button>
            )}
          </div>
          <ul className="flex flex-col gap-2">
            {g.suggestions.map((s) => (
              <li key={s.key} data-testid="suggestion" className="flex flex-col gap-2 rounded-xl bg-canvas p-3 ring-1 ring-line sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-ink-3">{s.workoutLabel} · {s.exerciseName}</p>
                  <p className="text-sm font-medium text-ink">{t.update(s.target)}</p>
                  <p className="text-xs text-ink-3">{t.current(s.current)}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button type="button" className="h-11" disabled={busy !== null} onClick={() => void apply(s.key, s.sessionId, s.changes)}>{t.apply}</Button>
                  <Button type="button" variant="outline" className="h-11" disabled={busy !== null} onClick={() => void keep(s)}>{t.keep}</Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
