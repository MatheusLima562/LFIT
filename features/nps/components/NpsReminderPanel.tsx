"use client";

import { HeartHandshake } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/db/client";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { reminderOutcome, statusText, type NpsStaffStatus } from "../nps";

const t = messages.nps.reminder;

/**
 * Estado do NPS de UM aluno para a equipe e o lembrete. O cartão aparece sozinho para o aluno; o lembrete não cria nem
 * antecipa nada — só acrescenta uma frase ao cartão que ele já vê ("pending"), uma vez por ciclo. Nunca mostra nota,
 * data de resposta nem o "Agora não" (vira "indisponível no momento"). Nada vai por notificação externa.
 */
export function NpsReminderPanel({ studentId, initial }: { studentId: string; initial: NpsStaffStatus }) {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);

  const remind = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("send_nps_reminder", { p_student_id: studentId });
      if (error) return void setOutcome({ ok: false, text: dbErrorMessage(error) });
      const r = data as unknown as NpsStaffStatus;
      setStatus(r);
      setOutcome(reminderOutcome(r));
    } catch {
      setOutcome({ ok: false, text: t.failed });
    } finally {
      setBusy(false);
    }
  };

  const reminded = status.state === "pending" && !!status.reminded_at;
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <HeartHandshake aria-hidden className="size-4 text-ink-3" />
          {t.title}
        </h2>
        <p className="mt-0.5 text-xs text-ink-3">{t.hint}</p>
      </div>
      <p className="text-sm text-ink">
        {statusText(status)}
        {reminded && status.reminded_at && <span className="block text-xs text-ink-3">{t.remindedAt(formatDate(status.reminded_at))}</span>}
      </p>
      {status.state === "pending" && !reminded && (
        <Button type="button" variant="outline" size="sm" className="self-start" disabled={busy} onClick={() => void remind()}>
          {busy ? t.sending : t.button}
        </Button>
      )}
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
