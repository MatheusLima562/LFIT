"use client";

import { AlertTriangle, CheckCircle2, ClipboardCheck, PhoneCall, Stethoscope } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { isoToBR, timestampToISODate, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DateField } from "@/features/students/components/form/DateField";
import { recordRedFlagCheck, recordRedFlagClearance } from "../red-flag-actions";
import { CLEARANCE_KINDS, RED_FLAG_NOTE_MAX, RED_FLAGS, redFlagLabel, type ClearanceKind, type RedFlagCheck, type RedFlagKey } from "../red-flags";
import { redFlagCheckSchema, redFlagClearanceSchema } from "../red-flag-schemas";
import type { GuideTone } from "../types";

const t = messages.redFlags;
const TONES: GuideTone[] = ["emergency", "sameDay", "refer"];
const TONE_ICON = { emergency: PhoneCall, sameDay: AlertTriangle, refer: Stethoscope };

/**
 * Triagem de sinais de alerta no cadastro do aluno. Owner e professor responsável, mesmo sem consentimento de saúde
 * (LGPD art. 11, II, "e"/"d" — a validar com advogado); só o mínimo: sinais, encaminhamento e liberação.
 */
export function RedFlagTriage({ studentId, check }: { studentId: string; check: RedFlagCheck | null }) {
  const [dialog, setDialog] = useState<"check" | "clear" | null>(null);
  const pending = !!check && check.items.length > 0 && !check.clearance;

  return (
    <section id="red-flags" aria-labelledby="red-flags-title" className="flex flex-col gap-2 rounded-xl border border-line bg-canvas px-3.5 py-3 scroll-mt-4">
      <h3 id="red-flags-title" className="flex items-center gap-2 text-[13px] font-semibold text-ink">
        <ClipboardCheck aria-hidden className="size-4 text-ink-3" />
        {t.title}
      </h3>
      <p className="text-xs text-ink-3">{t.hint}</p>

      {!check ? (
        <p className="text-[13px] text-ink-2">{t.none}</p>
      ) : check.items.length === 0 ? (
        <p className="text-[13px] text-ink-2">{t.lastNone(isoToBR(timestampToISODate(check.recordedAt)))}</p>
      ) : (
        <div className={cn("rounded-lg border px-3 py-2 text-[13px]", pending ? "border-warning-line bg-warning-soft text-warning-ink" : "border-line bg-surface text-ink-2")}>
          <p className="font-medium">{t.lastWith(isoToBR(timestampToISODate(check.recordedAt)))}:</p>
          <ul className="mt-1 list-disc pl-5">
            {check.items.map((k) => (
              <li key={k}>{redFlagLabel(k)}</li>
            ))}
          </ul>
          {check.referred && <p className="mt-1 text-xs font-medium">{t.referredDone}</p>}
          {check.note && <p className="mt-1 text-xs">{check.note}</p>}
          {check.clearance ? (
            <p className="mt-2 flex items-start gap-1.5 text-success-ink">
              <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                {t.cleared(t.kinds[check.clearance.kind], check.clearance.name, isoToBR(check.clearance.on))}
                {check.clearance.note && <span className="block text-xs text-ink-2">{check.clearance.note}</span>}
              </span>
            </p>
          ) : (
            <p className="mt-2 text-xs">{t.pending}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setDialog("check")}>
          {t.record}
        </Button>
        {pending && (
          <Button type="button" size="sm" onClick={() => setDialog("clear")}>
            {t.clear}
          </Button>
        )}
      </div>

      {dialog === "check" && <RedFlagCheckDialog studentId={studentId} onClose={() => setDialog(null)} />}
      {dialog === "clear" && check && <ClearanceDialog check={check} onClose={() => setDialog(null)} />}
    </section>
  );
}

/** "120/300" — o limite também vale no banco (CHECK e RPC). */
function NoteCount({ value }: { value: string }) {
  return <span className="shrink-0 tabular-nums">{t.noteCount(value.length, RED_FLAG_NOTE_MAX)}</span>;
}

/** Extraído para reuso no atalho do montador (painel "Condições do aluno"), sem o histórico da triagem. */
export function RedFlagCheckDialog({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const router = useRouter();
  const [items, setItems] = useState<RedFlagKey[]>([]);
  const [noneObserved, setNoneObserved] = useState(false);
  // Marcação explícita: o registro não afirma um encaminhamento que o professor não fez.
  const [referred, setReferred] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (key: RedFlagKey, on: boolean) => {
    setItems((prev) => (on ? [...prev, key] : prev.filter((k) => k !== key)));
    if (on) setNoneObserved(false);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.recordTitle}</DialogTitle>
          <DialogDescription>{t.recordHint}</DialogDescription>
        </DialogHeader>
        <form
          id="red-flag-check-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            // O diálogo fica dentro do formulário do aluno na árvore React: não deixar o submit subir.
            e.stopPropagation();
            const values = { items, noneObserved, referred: items.length > 0 && referred, note };
            const parsed = redFlagCheckSchema.safeParse(values);
            if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? null);
            startTransition(async () => {
              const r = await recordRedFlagCheck(studentId, values);
              if (!r.ok) return setError(r.error);
              toast.success(r.message);
              router.refresh();
              onClose();
            });
          }}
        >
          {TONES.map((tone) => {
            const Icon = TONE_ICON[tone];
            return (
              <fieldset key={tone} className="flex flex-col gap-2">
                <legend className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                  <Icon aria-hidden className={cn("size-4", tone === "emergency" ? "text-danger-ink" : tone === "sameDay" ? "text-warning-ink" : "text-ink-3")} />
                  {t.tone[tone]}
                </legend>
                {RED_FLAGS.filter((f) => f.tone === tone).map((f) => (
                  <Field key={f.key} orientation="horizontal">
                    <Checkbox id={`rf-${f.key}`} checked={items.includes(f.key)} onCheckedChange={(v) => toggle(f.key, v === true)} />
                    <FieldLabel htmlFor={`rf-${f.key}`} className="leading-snug font-normal">
                      {f.label}
                    </FieldLabel>
                  </Field>
                ))}
              </fieldset>
            );
          })}
          <Field orientation="horizontal" className="border-t border-line pt-3">
            <Checkbox
              id="rf-none"
              checked={noneObserved}
              onCheckedChange={(v) => {
                setNoneObserved(v === true);
                if (v === true) setItems([]);
              }}
            />
            <FieldLabel htmlFor="rf-none" className="leading-snug">
              {t.noneObserved}
            </FieldLabel>
          </Field>
          {items.length > 0 && (
            <Field orientation="horizontal">
              <Checkbox id="rf-referred" checked={referred} onCheckedChange={(v) => setReferred(v === true)} />
              <FieldLabel htmlFor="rf-referred" className="leading-snug">
                {t.referred}
              </FieldLabel>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="rf-note">{t.note}</FieldLabel>
            <Textarea
              id="rf-note"
              rows={2}
              maxLength={RED_FLAG_NOTE_MAX}
              value={note}
              placeholder={t.notePlaceholder}
              aria-describedby="rf-note-hint"
              onChange={(e) => setNote(e.target.value)}
            />
            <p id="rf-note-hint" className="flex justify-between gap-2 text-xs text-ink-3">
              <span>{t.noteHint}</span>
              <NoteCount value={note} />
            </p>
          </Field>
          {error && <FieldError>{error}</FieldError>}
        </form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            {messages.students.confirm.cancel}
          </Button>
          <Button type="submit" form="red-flag-check-form" disabled={pending}>
            {t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClearanceDialog({ check, onClose }: { check: RedFlagCheck; onClose: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<ClearanceKind | "">("");
  const [name, setName] = useState("");
  const [on, setOn] = useState(isoToBR(todayISO()));
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Partial<Record<"kind" | "name" | "on" | "form", string>>>({});
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.clearTitle}</DialogTitle>
          <DialogDescription>{t.clearHint}</DialogDescription>
        </DialogHeader>
        <form
          id="red-flag-clearance-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const values = { kind, name, on, note };
            const parsed = redFlagClearanceSchema.safeParse(values);
            if (!parsed.success) {
              const next: typeof errors = {};
              for (const issue of parsed.error.issues) {
                const key = issue.path[0] as "kind" | "name" | "on";
                next[key] ??= issue.message;
              }
              return setErrors(next);
            }
            startTransition(async () => {
              const r = await recordRedFlagClearance(check.id, values);
              if (!r.ok) return setErrors({ form: r.error });
              toast.success(r.message);
              router.refresh();
              onClose();
            });
          }}
        >
          <Field data-invalid={!!errors.kind}>
            <FieldLabel htmlFor="rf-kind">{t.kind}</FieldLabel>
            <Select value={kind || undefined} onValueChange={(v) => setKind(v as ClearanceKind)}>
              <SelectTrigger id="rf-kind" className="w-full" aria-invalid={!!errors.kind}>
                <SelectValue placeholder={t.kindPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {CLEARANCE_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t.kinds[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.kind && <FieldError>{errors.kind}</FieldError>}
          </Field>
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="rf-name">{t.name}</FieldLabel>
            <Input id="rf-name" value={name} maxLength={120} aria-invalid={!!errors.name} onChange={(e) => setName(e.target.value)} />
            {errors.name && <FieldError>{errors.name}</FieldError>}
          </Field>
          <Field data-invalid={!!errors.on}>
            <FieldLabel htmlFor="rf-on">{t.on}</FieldLabel>
            <DateField id="rf-on" value={on} onChange={setOn} invalid={!!errors.on} max={todayISO()} />
            {errors.on && <FieldError>{errors.on}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="rf-clear-note">{t.clearanceNote}</FieldLabel>
            <Textarea
              id="rf-clear-note"
              rows={2}
              maxLength={RED_FLAG_NOTE_MAX}
              value={note}
              placeholder={t.clearanceNotePlaceholder}
              aria-describedby="rf-clear-note-count"
              onChange={(e) => setNote(e.target.value)}
            />
            <p id="rf-clear-note-count" className="text-right text-xs text-ink-3">
              <NoteCount value={note} />
            </p>
          </Field>
          {errors.form && <FieldError>{errors.form}</FieldError>}
        </form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            {messages.students.confirm.cancel}
          </Button>
          <Button type="submit" form="red-flag-clearance-form" disabled={pending}>
            {t.saveClearance}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
