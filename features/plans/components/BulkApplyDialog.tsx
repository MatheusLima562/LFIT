"use client";

import Link from "next/link";
import { Check, CircleAlert, EyeOff, OctagonAlert, TriangleAlert } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { parseBRDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { DateField } from "@/features/students/components/form/DateField";
import { bulkApplyPlan, previewBulkApply, type BulkPreviewRow, type BulkResultRow } from "../actions";
import type { Option } from "./ApplyTemplateDialog";

const t = messages.plans.bulk;
type Step = "choose" | "preview" | "result";

/** Copia um plano ou modelo para vários alunos, com prévia de alertas por aluno. */
export function BulkApplyDialog({ source, students, onClose }: { source: { id: string; name: string }; students: Option[]; onClose: () => void }) {
  const [step, setStep] = useState<Step>("choose");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [noEnd, setNoEnd] = useState(false);
  const [activate, setActivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BulkPreviewRow[]>([]);
  const [result, setResult] = useState<BulkResultRow[]>([]);
  const [pending, startTransition] = useTransition();
  const names = useMemo(() => new Map(students.map((s) => [s.id, s.name])), [students]);

  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else if (next.size < 50) next.add(id);
      else toast.error(t.max);
      return next;
    });

  const dates = () => {
    const s = startsOn.trim() ? parseBRDate(startsOn) : null;
    const e = !noEnd && endsOn.trim() ? parseBRDate(endsOn) : null;
    if ((startsOn.trim() && !s) || (!noEnd && endsOn.trim() && !e)) return { error: messages.plans.validation.date };
    if (activate && (!s || (!e && !noEnd))) return { error: t.datesRequired };
    if (s && e && e < s) return { error: messages.plans.validation.endBeforeStart };
    return { s, e };
  };

  const goPreview = () => {
    const d = dates();
    if ("error" in d) return setError(d.error ?? null);
    setError(null);
    startTransition(async () => {
      const r = await previewBulkApply(source.id, [...picked]);
      if (!r.ok) return setError(r.error);
      setPreview(r.rows);
      setStep("preview");
    });
  };

  const apply = () => {
    const d = dates();
    if ("error" in d) return setError(d.error ?? null);
    startTransition(async () => {
      const r = await bulkApplyPlan({ sourceId: source.id, studentIds: [...picked], startsOn: d.s ?? null, endsOn: d.e ?? null, noEnd, activate });
      if (!r.ok) return setError(r.error);
      setResult(r.rows);
      setStep("result");
      const ok = r.rows.filter((x) => x.planId).length;
      toast.success(t.done(ok, r.rows.length));
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-line px-5 py-4">
          <DialogTitle>{t.title(source.name)}</DialogTitle>
          <DialogDescription>{step === "preview" ? t.previewHint : t.hint}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
          {step === "choose" && (
            <>
              <div className="flex flex-col gap-1.5">
                <span id="bulk-students" className="text-sm font-medium text-ink">
                  {t.students} <span className="font-normal text-ink-3">· {t.selected(picked.size)}</span>
                </span>
                <Command aria-labelledby="bulk-students" className="rounded-xl border border-line">
                  <CommandInput placeholder={t.search} />
                  <CommandList className="max-h-52">
                    <CommandEmpty>{messages.plans.templates.studentEmpty}</CommandEmpty>
                    {students.map((s) => (
                      <CommandItem key={s.id} value={`${s.name} ${s.id}`} onSelect={() => toggle(s.id)} aria-selected={picked.has(s.id)}>
                        <Check aria-hidden className={cn("size-4", picked.has(s.id) ? "opacity-100" : "opacity-0")} />
                        {s.name}
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </div>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-ink">{t.mode}</legend>
                {(["draft", "activate"] as const).map((m) => (
                  <label key={m} className="flex items-center gap-2 text-[13px] text-ink">
                    <input type="radio" name="bulk-mode" checked={activate === (m === "activate")} onChange={() => setActivate(m === "activate")} className="accent-brand-600" />
                    {t.modes[m]}
                  </label>
                ))}
              </fieldset>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="bulk-starts" className="text-sm font-medium text-ink">
                    {messages.plans.header.startsOn}
                  </label>
                  <DateField id="bulk-starts" value={startsOn} onChange={setStartsOn} min="2020-01-01" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="bulk-ends" className="text-sm font-medium text-ink">
                    {messages.plans.header.endsOn}
                  </label>
                  {noEnd ? (
                    <input id="bulk-ends" disabled value={messages.plans.header.noEnd} className="h-9 rounded-lg border border-input bg-canvas px-2.5 text-sm text-ink-3" />
                  ) : (
                    <DateField id="bulk-ends" value={endsOn} onChange={setEndsOn} min="2020-01-01" />
                  )}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-ink">
                <Switch checked={noEnd} onCheckedChange={setNoEnd} aria-label={messages.plans.header.noEnd} />
                {messages.plans.header.noEnd}
              </label>
            </>
          )}

          {step === "preview" && (
            <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
              {preview.map((r) => (
                <li key={r.studentId} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[13px]">
                  <span className="min-w-0 flex-1 font-medium text-ink">{names.get(r.studentId) ?? r.studentId}</span>
                  {r.error ? (
                    <span className="inline-flex items-center gap-1 text-destructive">
                      <CircleAlert aria-hidden className="size-4" />
                      {r.error}
                    </span>
                  ) : r.hidden ? (
                    <span className="inline-flex items-center gap-1 text-ink-3">
                      <EyeOff aria-hidden className="size-4" />
                      {t.hidden}
                    </span>
                  ) : r.avoid + r.caution === 0 ? (
                    <span className="text-ink-3">{t.noAlerts}</span>
                  ) : (
                    <>
                      {r.avoid > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                          <OctagonAlert aria-hidden className="size-3" />
                          {t.avoid(r.avoid)}
                        </span>
                      )}
                      {r.caution > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          <TriangleAlert aria-hidden className="size-3" />
                          {t.caution(r.caution)}
                        </span>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {step === "result" && (
            <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
              {result.map((r) => (
                <li key={r.studentId} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[13px]">
                  <span className="min-w-0 flex-1 font-medium text-ink">{names.get(r.studentId) ?? r.studentId}</span>
                  {r.planId ? (
                    <>
                      <span className="text-emerald-700">{t.resultOk(messages.plans.status[r.status as keyof typeof messages.plans.status] ?? "")}</span>
                      <Link href={`/alunos/${r.studentId}/treinos`} className="rounded text-brand-700 hover:underline">
                        {t.open}
                      </Link>
                    </>
                  ) : (
                    <span className="text-destructive">{r.error}</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="border-t border-line px-5 py-3">
          {step === "choose" && (
            <>
              <Button variant="ghost" onClick={onClose}>
                {messages.plans.manage.cancel}
              </Button>
              <Button disabled={pending || picked.size === 0} onClick={goPreview}>
                {t.preview}
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button variant="ghost" disabled={pending} onClick={() => setStep("choose")}>
                {t.back}
              </Button>
              <Button disabled={pending} onClick={apply}>
                {t.confirm(picked.size)}
              </Button>
            </>
          )}
          {step === "result" && <Button onClick={onClose}>{t.close}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
