"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/db/client";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { PAUSE_REASONS, type PauseReason } from "../pause";

const t = messages.pause;

/** Colocar o aluno em pausa (motivo da lista fixa, volta opcional). Do navegador direto para `set_student_pause`. */
export function PauseDialog({ studentId, name, open, onOpenChange }: { studentId: string; name: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const id = useId();
  const [reason, setReason] = useState<PauseReason>("viagem");
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("set_student_pause", { p_student_id: studentId, p_reason: reason, p_until: until || null });
      if (error) return void toast.error(dbErrorMessage(error));
      toast.success(t.saved);
      onOpenChange(false);
      router.refresh();
    } catch {
      toast.error(messages.app.actionFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.title(name)}</DialogTitle>
          <DialogDescription>{t.hint}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label htmlFor={`${id}-r`} className="text-sm font-medium text-ink">{t.reason}</label>
          <select id={`${id}-r`} value={reason} onChange={(e) => setReason(e.target.value as PauseReason)}
            className="h-10 rounded-lg border border-line bg-surface px-2 text-base text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm">
            {PAUSE_REASONS.map((r) => <option key={r} value={r}>{t.reasons[r]}</option>)}
          </select>
          <label htmlFor={`${id}-u`} className="text-sm font-medium text-ink">{t.until}</label>
          <Input id={`${id}-u`} type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="text-base md:text-sm" />
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t.cancel}</Button>
            <Button type="button" disabled={busy} onClick={() => void save()}>{t.save}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
