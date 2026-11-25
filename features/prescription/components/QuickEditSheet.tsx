"use client";

import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/db/client";
import { cn } from "@/lib/utils";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import {
  applyLocal, formatLoad, formatReps, loadEditable, mergeChanges, repsEditable, setsEditable, stepLoad, stepReps, stepSets,
  type Change, type QuickItem, type QuickWorkout,
} from "../prescription";

const t = messages.prescription;
const DEBOUNCE_MS = 900;

/** Botão +/− com área de toque de 44 px (uso no celular durante a aula). */
function StepButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-surface text-ink outline-none active:bg-canvas disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

function Stepper({ name, value, onMinus, onPlus, disabled }: { name: string; value: string; onMinus: () => void; onPlus: () => void; disabled?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium text-ink-3">{name}</span>
      <div className="flex items-center gap-1.5">
        <StepButton label={t.less(name.toLowerCase())} onClick={onMinus} disabled={disabled}><Minus aria-hidden className="size-4" /></StepButton>
        <output aria-live="polite" className="min-w-14 text-center text-sm font-semibold tabular-nums text-ink">{value}</output>
        <StepButton label={t.more(name.toLowerCase())} onClick={onPlus} disabled={disabled}><Plus aria-hidden className="size-4" /></StepButton>
      </div>
    </div>
  );
}

/**
 * Ficha rápida (PARTE A, item 2): +/− carga (passo da conta), repetições e séries, sem formulário. Cada toque muda a
 * tela na hora; toques seguidos no mesmo exercício viram UMA gravação (~1 s depois), sempre com o valor antigo esperado
 * — se o item mudou em outro lugar, o banco recusa e a tela volta ao valor do banco. Gravações em fila (uma por vez).
 */
export function QuickEditSheet({ workouts, loadStep }: { workouts: QuickWorkout[]; loadStep: number }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [tab, setTab] = useState(workouts[0]?.id ?? "");
  const [local, setLocal] = useState(workouts);
  const pending = useRef(new Map<string, Change[]>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [saving, setSaving] = useState(0);

  // Dados novos do servidor (router.refresh) substituem a cópia local quando nada está pendente.
  useEffect(() => {
    if (pending.current.size === 0) setLocal(workouts);
  }, [workouts]);

  const flush = useCallback((itemId: string) => {
    const changes = mergeChanges(pending.current.get(itemId) ?? []);
    pending.current.delete(itemId);
    if (!changes.length) return;
    setSaving((n) => n + 1);
    queue.current = queue.current.then(async () => {
      try {
        const { data, error } = await supabase.rpc("apply_prescription_changes", { p_changes: changes, p_source: "quick" });
        if (error) {
          toast.error(dbErrorMessage(error));
          pending.current.clear();
          setLocal(workouts);
          router.refresh();
          return;
        }
        const batch = (data as { batch_id?: string } | null)?.batch_id;
        toast.success(t.saved, batch ? {
          action: {
            label: t.undo,
            onClick: async () => {
              const r = await supabase.rpc("undo_prescription_batch", { p_batch_id: batch });
              if (r.error) toast.error(dbErrorMessage(r.error));
              else toast.success(t.history.undoneToast);
              router.refresh();
            },
          },
        } : undefined);
        router.refresh();
      } finally {
        setSaving((n) => n - 1);
      }
    });
  }, [router, supabase, workouts]);

  const tap = (item: QuickItem, changes: Change[]) => {
    if (!changes.length) return;
    setLocal((ws) => ws.map((w) => ({ ...w, items: w.items.map((i) => (i.id === item.id ? applyLocal(i, changes) : i)) })));
    pending.current.set(item.id, [...(pending.current.get(item.id) ?? []), ...changes]);
    clearTimeout(timers.current.get(item.id));
    timers.current.set(item.id, setTimeout(() => flush(item.id), DEBOUNCE_MS));
  };

  useEffect(() => {
    const ts = timers.current;
    return () => ts.forEach((x) => clearTimeout(x));
  }, []);

  const current = local.find((w) => w.id === tab) ?? local[0];
  if (!current) return null;

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label={t.sheetTitle} className="flex gap-1.5 overflow-x-auto pb-1">
        {local.map((w) => (
          <button
            key={w.id}
            type="button"
            role="tab"
            aria-selected={w.id === current.id}
            onClick={() => setTab(w.id)}
            className={cn(
              "h-11 shrink-0 rounded-xl px-4 text-sm font-semibold outline-none ring-1 focus-visible:ring-2 focus-visible:ring-ring",
              w.id === current.id ? "bg-ink text-surface ring-ink" : "bg-surface text-ink ring-line",
            )}
          >
            {t.workoutTab(w.label)}
          </button>
        ))}
      </div>
      <p className="text-xs text-ink-3" aria-live="polite">
        {t.stepHint(formatLoad(loadStep, null))}{saving > 0 ? ` · ${t.saving}` : ""}
      </p>
      <ul role="tabpanel" aria-label={t.workoutTab(current.label)} className="flex flex-col gap-2.5">
        {current.items.map((i) => (
          <li key={i.id} data-testid="quick-item" className="rounded-2xl border border-line bg-surface p-3 shadow-card">
            <p className="text-[15px] font-semibold text-ink">{i.exerciseName}</p>
            <p className="mb-2 text-xs text-ink-3">
              {i.sets ?? "—"} × {i.quantityUnit === "reps" ? formatReps(i.quantityMin, i.quantityMax) : i.quantityMin ?? "—"} · {i.loadText ?? formatLoad(i.loadValue, i.loadUnit)}
            </p>
            {i.detailed ? (
              <p className="text-xs text-ink-2">{t.detailedHint}</p>
            ) : (
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {loadEditable(i) ? (
                  <Stepper name={t.load} value={formatLoad(i.loadValue, i.loadUnit)} onMinus={() => tap(i, stepLoad(i, loadStep, -1))} onPlus={() => tap(i, stepLoad(i, loadStep, 1))} />
                ) : (
                  <p className="self-end text-xs text-ink-2">{t.loadTextHint}</p>
                )}
                {repsEditable(i) && (
                  <Stepper name={t.reps} value={formatReps(i.quantityMin, i.quantityMax).replace(" reps", "")} onMinus={() => tap(i, stepReps(i, -1))} onPlus={() => tap(i, stepReps(i, 1))} />
                )}
                {setsEditable(i) && (
                  <Stepper name={t.sets} value={String(i.sets ?? "—")} onMinus={() => tap(i, stepSets(i, -1))} onPlus={() => tap(i, stepSets(i, 1))} />
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
