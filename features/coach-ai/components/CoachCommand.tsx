"use client";

import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useId, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describeChange, type Change } from "@/features/prescription/prescription";
import { callAction } from "@/lib/action";
import { createClient } from "@/lib/db/client";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { runCoachCommand } from "../actions";
import type { ProposalRow } from "../coach-ai";
import type { CoachStatus } from "../queries";

const t = messages.coachAi;

/**
 * Campo de comando (PARTE B) na edição rápida. A IA só PROPÕE: a tela mostra "antes → depois" e só "Aplicar alterações"
 * grava (`apply_prescription_changes`, origem "ai" — mesmas permissões, histórico e desfazer). Pergunta da IA aparece
 * como pergunta; nada muda.
 */
export function CoachCommand({ studentId, status }: { studentId: string; status: CoachStatus }) {
  const id = useId();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [command, setCommand] = useState("");
  const [pending, start] = useTransition();
  const [remaining, setRemaining] = useState(status.remaining);
  const [proposal, setProposal] = useState<{ changes: Change[]; rows: ProposalRow[] } | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;
    setProposal(null);
    setQuestion(null);
    start(async () => {
      const r = await callAction(() => runCoachCommand(studentId, command));
      if (!r) return;
      if (r.status === "error") return void toast.error(r.message);
      if (r.status === "info") return void setQuestion(r.message);
      if (r.status === "choose") return; // só no microfone central (aqui o aluno já está aberto)
      setRemaining(r.remaining);
      if (r.status === "question") setQuestion(r.question);
      else setProposal({ changes: r.changes, rows: r.rows });
    });
  };

  const apply = async () => {
    if (!proposal) return;
    setApplying(true);
    try {
      const { data, error } = await supabase.rpc("apply_prescription_changes", { p_changes: proposal.changes, p_source: "ai" });
      if (error) {
        toast.error(dbErrorMessage(error));
        setProposal(null);
        router.refresh();
        return;
      }
      const batch = (data as { batch_id?: string } | null)?.batch_id;
      toast.success(t.applied, batch ? {
        action: {
          label: messages.prescription.undo,
          onClick: async () => {
            const u = await supabase.rpc("undo_prescription_batch", { p_batch_id: batch });
            if (u.error) toast.error(dbErrorMessage(u.error));
            else toast.success(messages.prescription.history.undoneToast);
            router.refresh();
          },
        },
      } : undefined);
      setProposal(null);
      setCommand("");
      router.refresh();
    } finally {
      setApplying(false);
    }
  };

  return (
    <section aria-labelledby={`${id}-t`} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div>
        <h2 id={`${id}-t`} className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <Sparkles aria-hidden className="size-4 text-ink-3" />
          {t.title}
        </h2>
        <p className="mt-0.5 text-xs text-ink-3">{t.hint}</p>
        <p className="mt-1 text-xs text-ink-2">{t.privacy}</p>
      </div>
      <form onSubmit={send} className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-c`} className="text-sm font-medium text-ink">{t.label}</label>
        <div className="flex gap-2">
          <Input id={`${id}-c`} className="h-11" value={command} maxLength={status.maxChars} enterKeyHint="send" autoComplete="off"
            onChange={(e) => setCommand(e.target.value)} disabled={pending || remaining <= 0} />
          <Button type="submit" className="h-11 shrink-0" disabled={pending || !command.trim() || remaining <= 0}>{pending ? t.sending : t.send}</Button>
        </div>
        <p className="text-xs text-ink-3" aria-live="polite">
          {t.remaining(remaining, status.dailyLimit)}
          {status.costMonthMicros !== null ? ` · ${t.cost((status.costMonthMicros / 1_000_000).toFixed(2).replace(".", ","))}` : ""}
        </p>
      </form>

      {question && (
        <div role="status" className="rounded-xl bg-info-soft p-3 text-sm text-info-ink ring-1 ring-info-line">
          <p className="font-medium">{t.question}</p>
          <p>{question}</p>
        </div>
      )}

      {proposal && (
        <div className="flex flex-col gap-2" data-testid="coach-proposal">
          <p className="text-sm font-medium text-ink">{t.proposalTitle}</p>
          <ul className="flex flex-col gap-1 rounded-xl bg-canvas p-3 text-sm ring-1 ring-line">
            {proposal.rows.map((r, k) => (
              <li key={k}>
                <span className="font-medium text-ink">{r.workoutLabel} · {r.exercise}</span>: {describeChange({ field: r.field, old: r.before, new: r.after, unit: r.unit })}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button type="button" className="h-11" disabled={applying} onClick={() => void apply()}>{t.confirm}</Button>
            <Button type="button" variant="outline" className="h-11" disabled={applying} onClick={() => setProposal(null)}>{t.discard}</Button>
          </div>
        </div>
      )}
    </section>
  );
}
