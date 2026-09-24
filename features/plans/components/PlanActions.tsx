"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Copy, Eye, LayoutTemplate, MoreHorizontal, Pencil, Printer, UserPlus, Users } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { archivePlan, duplicatePlan, savePlanAsTemplate, type PlanActionResult } from "../actions";
import type { PlanStatus } from "../queries";
import { ApplyTemplateDialog, type Option } from "./ApplyTemplateDialog";
import { BulkApplyDialog } from "./BulkApplyDialog";

const t = messages.plans.manage;

interface Props {
  plan: { id: string; name: string; status: PlanStatus; canEdit: boolean };
  isTemplate: boolean;
  /** Modelos: alunos para "Aplicar a aluno". */
  students?: Option[];
}

/** Ações de um plano (aluno ou modelo): editar/ver, duplicar, salvar como modelo, aplicar, imprimir, arquivar. */
export function PlanActions({ plan, isTemplate, students }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<null | "archive" | "template" | "apply" | "bulk">(null);
  const [name, setName] = useState(plan.name);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<PlanActionResult>, then?: (id: string) => void) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error);
        return void toast.error(r.error);
      }
      toast.success(r.message);
      setDialog(null);
      if (then) then(r.id);
      else router.refresh();
    });

  const editable = plan.canEdit;
  return (
    <div className="flex items-center gap-1">
      <Button asChild variant="outline" size="sm">
        <Link href={`/treinos/${plan.id}/editar`}>
          {editable ? <Pencil aria-hidden /> : <Eye aria-hidden />}
          {editable ? t.edit : t.view}
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t.more(plan.name)} disabled={pending}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {isTemplate && students && (
            <DropdownMenuItem onSelect={() => setDialog("apply")}>
              <UserPlus aria-hidden />
              {messages.plans.templates.applyToStudent}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href={`/treinos/${plan.id}/imprimir`}>
              <Printer aria-hidden />
              {t.print}
            </Link>
          </DropdownMenuItem>
          {students && (
            <DropdownMenuItem onSelect={() => setDialog("bulk")}>
              <Users aria-hidden />
              {messages.plans.bulk.menu}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => run(() => duplicatePlan(plan.id), (id) => router.push(`/treinos/${id}/editar`))}>
            <Copy aria-hidden />
            {t.duplicate}
          </DropdownMenuItem>
          {!isTemplate && (
            <DropdownMenuItem
              onSelect={() => {
                setName(plan.name);
                setError(null);
                setDialog("template");
              }}
            >
              <LayoutTemplate aria-hidden />
              {t.saveAsTemplate}
            </DropdownMenuItem>
          )}
          {editable && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setDialog("archive")}>
                <Archive aria-hidden />
                {t.archive}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={dialog === "archive"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t.archiveTitle}
        description={t.archiveText(plan.name, plan.status === "active")}
        confirmLabel={t.archive}
        cancelLabel={t.cancel}
        destructive
        pending={pending}
        onConfirm={() => run(() => archivePlan(plan.id))}
      />

      <Dialog open={dialog === "template"} onOpenChange={(open) => !open && !pending && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.saveAsTemplate}</DialogTitle>
            <DialogDescription>{messages.plans.templates.subtitle}</DialogDescription>
          </DialogHeader>
          <form
            id={`tpl-${plan.id}`}
            onSubmit={(e) => {
              e.preventDefault();
              run(() => savePlanAsTemplate(plan.id, name), (id) => router.push(`/treinos/${id}/editar`));
            }}
          >
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor={`tpl-name-${plan.id}`}>{t.templateName}</FieldLabel>
              <Input id={`tpl-name-${plan.id}`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} aria-invalid={!!error} autoFocus />
              {error && <FieldError>{error}</FieldError>}
            </Field>
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={pending}>
              {t.cancel}
            </Button>
            <Button type="submit" form={`tpl-${plan.id}`} disabled={pending || name.trim().length < 2}>
              {t.saveAsTemplate}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {dialog === "bulk" && students && <BulkApplyDialog source={{ id: plan.id, name: plan.name }} students={students} onClose={() => setDialog(null)} />}
      {dialog === "apply" && students && isTemplate && (
        <ApplyTemplateDialog fixed={{ kind: "template", id: plan.id, name: plan.name }} options={students} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
