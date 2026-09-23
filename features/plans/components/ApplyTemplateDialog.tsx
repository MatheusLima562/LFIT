"use client";

import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { parseBRDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateField } from "@/features/students/components/form/DateField";
import { applyTemplate } from "../actions";

const t = messages.plans.manage;

export type Option = { id: string; name: string };

interface Props {
  /** O que já está definido: o aluno (escolhe o modelo) ou o modelo (escolhe o aluno). */
  fixed: { kind: "student" | "template"; id: string; name: string };
  options: Option[];
  onClose: () => void;
}

export function ApplyTemplateDialog({ fixed, options, onClose }: Props) {
  const router = useRouter();
  const [choice, setChoice] = useState<string | null>(null);
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pickingStudent = fixed.kind === "template";

  const submit = () => {
    const s = startsOn.trim() ? parseBRDate(startsOn) : null;
    const e = endsOn.trim() ? parseBRDate(endsOn) : null;
    if ((startsOn.trim() && !s) || (endsOn.trim() && !e)) return setError(messages.plans.validation.date);
    if (!choice) return;
    startTransition(async () => {
      const r = await applyTemplate({
        templateId: pickingStudent ? fixed.id : choice,
        studentId: pickingStudent ? choice : fixed.id,
        startsOn: s,
        endsOn: e,
      });
      if (!r.ok) return setError(r.error);
      toast.success(r.message);
      router.push(`/treinos/${r.id}/editar`);
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{pickingStudent ? `${messages.plans.templates.applyToStudent}: ${fixed.name}` : `${t.applyTemplate} · ${fixed.name}`}</DialogTitle>
          <DialogDescription>{t.applyHint}</DialogDescription>
        </DialogHeader>

        {options.length === 0 ? (
          <p className="rounded-xl bg-canvas px-3 py-4 text-center text-[13px] text-ink-3">
            {pickingStudent ? messages.plans.templates.studentEmpty : t.noTemplates}
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span id="apply-choice" className="text-sm font-medium text-ink">
              {pickingStudent ? messages.plans.templates.student : t.template}
            </span>
            <Command aria-labelledby="apply-choice" className="rounded-xl border border-line">
              <CommandInput placeholder={pickingStudent ? messages.plans.templates.studentSearch : t.templatePlaceholder} />
              <CommandList className="max-h-52">
                <CommandEmpty>{messages.plans.templates.studentEmpty}</CommandEmpty>
                {options.map((o) => (
                  <CommandItem key={o.id} value={`${o.name} ${o.id}`} onSelect={() => setChoice(o.id)} aria-selected={choice === o.id}>
                    <Check aria-hidden className={cn("size-4", choice === o.id ? "opacity-100" : "opacity-0")} />
                    {o.name}
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="apply-starts" className="text-sm font-medium text-ink">
              {messages.plans.header.startsOn}
            </label>
            <DateField id="apply-starts" value={startsOn} onChange={setStartsOn} min="2020-01-01" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="apply-ends" className="text-sm font-medium text-ink">
              {messages.plans.header.endsOn}
            </label>
            <DateField id="apply-ends" value={endsOn} onChange={setEndsOn} min="2020-01-01" />
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t.cancel}
          </Button>
          <Button onClick={submit} disabled={pending || !choice}>
            {t.apply}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
