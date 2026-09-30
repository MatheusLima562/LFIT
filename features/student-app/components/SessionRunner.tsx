"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CloudOff, Loader2, CircleCheck, PartyPopper } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/db/client";
import { cn } from "@/lib/utils";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { parseDecimal, setTargets } from "../format";
import { enqueue, flush, isNetworkError, loadQueue, saveQueue, type QueueOp, type RunResult } from "../queue";
import { applyOp, firstOpenItem, initialRunState, nextOpenItem, type RunState, type SetEntry } from "../session-state";
import type { AppTrainingSession } from "../types";
import { FocusExercise } from "./FocusExercise";
import { ProgressStrip } from "./ProgressStrip";
import { RestTimer } from "./RestTimer";

const t = messages.aluno;

/** Tela de execução: série a série, com fila local (internet ruim) e descanso. Renderizada só no cliente. */
export function SessionRunner({ data, askCheckin, backHref = "/aluno" }: { data: AppTrainingSession; askCheckin: boolean; backHref?: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const sessionId = data.session.id;
  const restricted = data.mode === "restricted";
  const items = data.workout.items;

  // Fila de uma visita anterior (sem internet): lida uma vez e reaplicada na tela.
  const [initialQueue] = useState(() => loadQueue(sessionId));
  const queueRef = useRef<QueueOp[]>(initialQueue);
  const [run, setRun] = useState<RunState>(() => initialQueue.reduce(applyOp, initialRunState(data)));
  const [pending, setPending] = useState(initialQueue.length);
  const [sync, setSync] = useState<"idle" | "saving" | "offline">("idle");
  const [openId, setOpenId] = useState<string | null>(() => firstOpenItem(items, run));
  // Descanso: segundos + chave (reinicia a contagem a cada série).
  const [rest, setRest] = useState<{ seconds: number; key: number } | null>(null);
  const [checkinOpen, setCheckinOpen] = useState(askCheckin && !restricted);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [rpe, setRpe] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const running = useRef(false);

  const setQueue = useCallback(
    (q: QueueOp[]) => {
      queueRef.current = q;
      saveQueue(sessionId, q);
      setPending(q.length);
    },
    [sessionId],
  );

  const runOp = useCallback(
    async (op: QueueOp): Promise<RunResult> => {
      try {
        const { error } =
          op.kind === "log_set"
            ? await supabase.rpc("log_set", { p_session_id: op.sessionId, p_item_id: op.itemId, p_set_index: op.setIndex, p_data: op.data })
            : op.kind === "complete_item"
              ? await supabase.rpc("complete_session_item", {
                  p_session_id: op.sessionId,
                  p_item_id: op.itemId,
                  // Nulo explícito: PostgREST precisa do argumento para escolher a função.
                  p_pain_score: op.pain as number,
                  p_substitute_exercise_id: op.substituteId as string,
                })
              : op.kind === "pain_checkin"
                ? await supabase.rpc("record_pain_checkin", { p_session_id: op.sessionId, p_answer: op.answer })
                : await supabase.rpc("finish_workout_session", {
                    p_session_id: op.sessionId,
                    p_rpe: op.rpe as number,
                    p_feedback: op.feedback as string,
                  });
        if (!error) return "ok";
        return isNetworkError(error) ? "retry" : { error: dbErrorMessage(error) };
      } catch {
        return "retry";
      }
    },
    [supabase],
  );

  const processQueue = useCallback(async () => {
    if (running.current || !queueRef.current.length) return;
    running.current = true;
    setSync("saving");
    const r = await flush(() => queueRef.current, setQueue, runOp);
    running.current = false;
    r.errors.forEach((e) => toast.error(e));
    setSync(r.offline ? "offline" : "idle");
  }, [runOp, setQueue]);

  // Envia o que ficou de uma visita anterior; tenta de novo quando a conexão volta e, por garantia, a cada 15 s.
  useEffect(() => {
    void processQueue();
    const online = () => void processQueue();
    window.addEventListener("online", online);
    const id = window.setInterval(() => void processQueue(), 15_000);
    return () => {
      window.removeEventListener("online", online);
      window.clearInterval(id);
    };
  }, [processQueue]);

  // Finalização só sai da tela quando a fila inteira (inclusive o "finalizar") foi gravada.
  useEffect(() => {
    if (!finishing || pending > 0) return;
    toast.success(t.run.finished);
    router.replace(backHref);
    router.refresh();
  }, [finishing, pending, router, backHref]);

  const push = (op: QueueOp) => {
    setQueue(enqueue(queueRef.current, op));
    setRun((s) => applyOp(s, op));
    void processQueue();
  };

  const editSet = (itemId: string, setIndex: number, patch: Partial<SetEntry>) =>
    setRun((s) => ({
      ...s,
      [itemId]: { ...s[itemId], sets: { ...s[itemId].sets, [setIndex]: { ...s[itemId].sets[setIndex], ...patch } } },
    }));

  const setDone = (itemId: string, setIndex: number) => {
    const item = items.find((i) => i.id === itemId)!;
    const target = setTargets(item).find((tg) => tg.index === setIndex)!;
    const entry = run[itemId].sets[setIndex];
    const load = parseDecimal(entry.load);
    push({
      kind: "log_set",
      sessionId,
      itemId,
      setIndex,
      data: {
        quantity_value: parseDecimal(entry.qty),
        load_value: load,
        load_unit: load === null ? null : target.defaultLoadUnit,
        load_text: null,
        substitute_exercise_id: run[itemId].substituteId,
      },
    });
    if (target.restSeconds) setRest((r) => ({ seconds: target.restSeconds!, key: (r?.key ?? 0) + 1 }));
  };

  const goTo = (id: string | null) => {
    setOpenId(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Concluir avança sozinho para o próximo exercício ainda aberto (com volta ao começo).
  const complete = (itemId: string, pain: number | null) => {
    push({ kind: "complete_item", sessionId, itemId, pain, substituteId: run[itemId].substituteId });
    setRest(null);
    goTo(nextOpenItem(items, { ...run, [itemId]: { ...run[itemId], completed: true } }, itemId));
  };

  const finish = () => {
    push({ kind: "finish", sessionId, rpe, feedback: feedback.trim() || null });
    setFinishOpen(false);
    setFinishing(true);
  };

  const doneCount = items.filter((i) => run[i.id]?.completed).length;
  const focusIndex = openId ? items.findIndex((i) => i.id === openId) : -1;
  const focusItem = focusIndex >= 0 ? items[focusIndex] : null;
  const groups = new Map<string, number>();
  items.forEach((i) => i.group_key && groups.set(i.group_key, (groups.get(i.group_key) ?? 0) + 1));

  return (
    <div className="flex flex-col gap-4 pb-16">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-ink-2">
          <Link href={backHref}>
            <ArrowLeft aria-hidden />
            {t.run.back}
          </Link>
        </Button>
        <p
          role="status"
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] ring-1",
            sync === "offline" ? "bg-warning-soft text-warning-ink ring-warning-line" : "bg-surface text-ink-2 ring-line",
          )}
        >
          {sync === "offline" ? (
            <>
              <CloudOff aria-hidden className="size-3.5" />
              {t.sync.offline(pending)}
            </>
          ) : sync === "saving" || pending > 0 ? (
            <>
              <Loader2 aria-hidden className="size-3.5 animate-spin" />
              {t.sync.saving}
            </>
          ) : (
            <>
              <CircleCheck aria-hidden className="size-3.5 text-success-ink" />
              {t.sync.saved}
            </>
          )}
        </p>
      </div>

      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          {data.workout.label} · {data.workout.name || `Treino ${data.workout.label}`}
        </h1>
        <p className="text-[13px] text-ink-2">
          {doneCount}/{items.length} · {t.today.exercises(items.length)}
        </p>
        {data.workout.notes && <p className="mt-2 text-[13px] whitespace-pre-line text-ink-2">{data.workout.notes}</p>}
      </header>

      <ProgressStrip items={items} run={run} currentId={openId} onSelect={goTo} />

      {focusItem ? (
        <FocusExercise
          key={focusItem.id}
          item={focusItem}
          index={focusIndex}
          total={items.length}
          state={run[focusItem.id]}
          restricted={restricted}
          groupLabel={focusItem.group_key ? messages.plans.groupLabel(groups.get(focusItem.group_key) ?? 1) : null}
          onEditSet={(setIndex, patch) => editSet(focusItem.id, setIndex, patch)}
          onSetDone={(setIndex) => setDone(focusItem.id, setIndex)}
          onSubstitute={(exerciseId) => setRun((st) => ({ ...st, [focusItem.id]: { ...st[focusItem.id], substituteId: exerciseId } }))}
          onComplete={(pain) => complete(focusItem.id, pain)}
          onReopen={() => setRun((st) => ({ ...st, [focusItem.id]: { ...st[focusItem.id], completed: false } }))}
          onPrev={focusIndex > 0 ? () => goTo(items[focusIndex - 1].id) : null}
          onNext={focusIndex < items.length - 1 ? () => goTo(items[focusIndex + 1].id) : null}
        />
      ) : (
        <section className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
          <PartyPopper aria-hidden className="size-8 text-ink-3" />
          <p className="text-[15px] font-medium text-ink">{doneCount === items.length ? t.run.allDone : t.run.finishTitle}</p>
        </section>
      )}

      {finishing && pending > 0 ? (
        <p role="status" className="rounded-xl border border-warning-line bg-warning-soft px-3 py-2.5 text-[13px] text-warning-ink">
          {t.sync.waitFinish}
        </p>
      ) : (
        <Button type="button" size="lg" variant={doneCount === items.length ? "default" : "outline"} className="h-12 w-full text-base" onClick={() => setFinishOpen(true)}>
          {t.run.finish}
        </Button>
      )}

      {rest && <RestTimer key={rest.key} seconds={rest.seconds} onDone={() => setRest(null)} />}

      <Dialog open={checkinOpen} onOpenChange={setCheckinOpen}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t.pain.checkinTitle}</DialogTitle>
            <DialogDescription>{t.pain.checkinStillNote}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              size="lg"
              className="h-12"
              onClick={() => {
                push({ kind: "pain_checkin", sessionId, answer: "normal" });
                setCheckinOpen(false);
              }}
            >
              {t.pain.checkinNormal}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="h-12"
              onClick={() => {
                push({ kind: "pain_checkin", sessionId, answer: "ainda_incomoda" });
                setCheckinOpen(false);
              }}
            >
              {t.pain.checkinStill}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={finishOpen} onOpenChange={setFinishOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.run.finishTitle}</DialogTitle>
            <DialogDescription className="sr-only">{t.run.rpe}</DialogDescription>
          </DialogHeader>
          <fieldset className="flex flex-col gap-2">
            <legend id="rpe-label" className="mb-1 text-[13px] text-ink-2">
              {t.run.rpe}
            </legend>
            <div role="radiogroup" aria-labelledby="rpe-label" className="grid grid-cols-5 gap-1.5">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rpe === n}
                  aria-label={t.run.rpeValue(n)}
                  onClick={() => setRpe(rpe === n ? null : n)}
                  className={cn(
                    "h-11 rounded-lg text-[15px] font-semibold tabular-nums ring-1 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    rpe === n ? "bg-ink text-surface ring-ink" : "bg-surface text-ink ring-line hover:bg-canvas",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>
          {!restricted && (
            <label htmlFor="feedback" className="flex flex-col gap-1.5 text-[13px] text-ink-2">
              {t.run.feedback}
              <Textarea id="feedback" rows={3} maxLength={300} value={feedback} placeholder={t.run.feedbackPlaceholder} onChange={(e) => setFeedback(e.target.value)} />
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setFinishOpen(false)}>
              {t.run.cancel}
            </Button>
            <Button type="button" onClick={finish}>
              {t.run.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
