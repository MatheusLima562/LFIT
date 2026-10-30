"use client";

import { HeartHandshake } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/db/client";
import { cn } from "@/lib/utils";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { requestOutcome, type NpsRequestResult } from "../nps";

const t = messages.nps.request;

/**
 * "Pedir avaliação" para UM aluno (a RPC recebe um id só; não há envio em massa). Só marca o aluno para ver o cartão na
 * próxima abertura do app — nenhum texto vai por notificação externa. Se o aluno ainda não pode responder (90 dias,
 * 30 dias de uso, 8 treinos, sem acesso), o motivo aparece aqui, vindo do banco.
 */
export function RequestNpsButton({ studentId }: { studentId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);

  const request = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("request_nps", { p_student_id: studentId });
      setOutcome(error ? { ok: false, text: dbErrorMessage(error) } : requestOutcome(data as unknown as NpsRequestResult));
    } catch {
      setOutcome({ ok: false, text: t.failed });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <HeartHandshake aria-hidden className="size-4 text-ink-3" />
          {t.title}
        </h2>
        <p className="mt-0.5 text-xs text-ink-3">{t.hint}</p>
      </div>
      <Button type="button" variant="outline" size="sm" className="self-start" disabled={busy} onClick={() => void request()}>
        {busy ? t.sending : t.button}
      </Button>
      <p
        role="status"
        className={cn(
          "text-sm empty:hidden",
          outcome && (outcome.ok ? "rounded-xl bg-success-soft p-3 text-success-ink ring-1 ring-success-line" : "rounded-xl bg-info-soft p-3 text-info-ink ring-1 ring-info-line"),
        )}
      >
        {outcome?.text ?? ""}
      </p>
    </div>
  );
}
