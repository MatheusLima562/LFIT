"use client";

import { Check, HeartPulse, Inbox, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ageFrom, formatDate } from "@/lib/format";
import { formatPhoneDisplay } from "@/lib/phone";
import { messages } from "@/messages/pt-BR";
import { GroupsField, type GroupOption } from "@/features/students/components/form/GroupsField";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { approveSignup, approveSignups, rejectSignups, type ApproveResult } from "../actions";
import type { PendingSignup } from "../queries";

const a = messages.signup.admin;
const NONE = "none";

interface Props {
  signups: PendingSignup[];
  trainers: { id: string; name: string }[];
  groups: GroupOption[];
}

function TrainerSelect({ id, value, onChange, trainers }: { id: string; value: string; onChange: (v: string) => void; trainers: Props["trainers"] }) {
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger id={id} className="w-full sm:w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{messages.studentForm.noTrainer}</SelectItem>
        {trainers.map((t) => (
          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function details(s: PendingSignup) {
  return [
    s.birthDate ? `${ageFrom(s.birthDate)} anos` : null,
    s.sex ? messages.students.sex[s.sex] : null,
    s.whatsapp ? formatPhoneDisplay(s.whatsapp) : null,
    s.trainingLocation,
  ].filter(Boolean).join(" · ");
}

export function PendingSignups({ signups, trainers, groups: initialGroups }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchTrainer, setBatchTrainer] = useState("");
  const [approving, setApproving] = useState<PendingSignup | null>(null);
  const [rejecting, setRejecting] = useState<string[] | null>(null);
  const [groups, setGroups] = useState(initialGroups);
  const [pending, startTransition] = useTransition();

  const report = (r: ApproveResult) => {
    if (r.ok) toast.success(r.message);
    else toast.error(r.error);
    return r.ok;
  };
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (signups.length === 0) return <EmptyState icon={<Inbox />} message={a.empty} className="min-h-48 bg-surface" />;

  const ids = [...selected].filter((id) => signups.some((s) => s.id === id));
  const allSelected = ids.length === signups.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3 shadow-card sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 px-1">
          <Checkbox
            id="select-all"
            checked={allSelected ? true : ids.length > 0 ? "indeterminate" : false}
            onCheckedChange={(v) => setSelected(v === true ? new Set(signups.map((s) => s.id)) : new Set())}
          />
          <Label htmlFor="select-all" className="font-normal">{a.selectAll}</Label>
        </div>
        {ids.length > 0 && (
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Label htmlFor="batch-trainer" className="sr-only">{a.batchTrainer}</Label>
            <TrainerSelect id="batch-trainer" value={batchTrainer} onChange={setBatchTrainer} trainers={trainers} />
            <div className="flex gap-2">
              <Button
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    if (report(await approveSignups(ids, batchTrainer || null))) setSelected(new Set());
                  })
                }
              >
                <Check aria-hidden />
                {a.approveSelected(ids.length)}
              </Button>
              <Button variant="outline" disabled={pending} onClick={() => setRejecting(ids)}>
                <X aria-hidden />
                {a.rejectSelected(ids.length)}
              </Button>
            </div>
          </div>
        )}
      </div>
      {ids.length > 0 && <p className="px-1 text-xs text-ink-3">{a.batchHint}</p>}

      <ul className="flex flex-col gap-2">
        {signups.map((s) => {
          const name = `${s.firstName} ${s.lastName}`;
          return (
            <li key={s.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <Checkbox className="mt-1" checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} aria-label={a.selectOne(name)} />
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-ink">{name}</p>
                  <p className="truncate text-[13px] text-ink-2">{s.email}</p>
                  <p className="mt-0.5 text-xs text-ink-3">
                    {[details(s), `${a.receivedAt} ${formatDate(s.createdAt)}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 pl-7 sm:pl-0">
                {s.healthDescription && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-brand-100">
                    <HeartPulse aria-hidden className="size-3" />
                    {a.healthInformed}
                  </span>
                )}
                <Button size="sm" onClick={() => setApproving(s)}>{a.approve}</Button>
                <Button size="sm" variant="ghost" onClick={() => setRejecting([s.id])}>{a.reject}</Button>
              </div>
            </li>
          );
        })}
      </ul>

      {approving && (
        <ApproveDialog
          signup={approving}
          trainers={trainers}
          groups={groups}
          onGroupCreated={(g) => setGroups((prev) => [...prev, g].sort((x, y) => x.name.localeCompare(y.name, "pt-BR")))}
          onClose={() => setApproving(null)}
        />
      )}

      <ConfirmDialog
        open={rejecting !== null}
        onOpenChange={(open) => !open && setRejecting(null)}
        title={a.rejectTitle(rejecting?.length ?? 1)}
        description={a.rejectText}
        confirmLabel={a.reject}
        cancelLabel={messages.students.confirm.cancel}
        destructive
        pending={pending}
        onConfirm={() =>
          startTransition(async () => {
            if (!rejecting) return;
            if (report(await rejectSignups(rejecting))) {
              setSelected(new Set());
              setRejecting(null);
            }
          })
        }
      />
    </div>
  );
}

function ApproveDialog({
  signup,
  trainers,
  groups,
  onGroupCreated,
  onClose,
}: {
  signup: PendingSignup;
  trainers: Props["trainers"];
  groups: GroupOption[];
  onGroupCreated: (g: GroupOption) => void;
  onClose: () => void;
}) {
  const [trainerId, setTrainerId] = useState("");
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canClassify = Boolean(signup.consentAt);

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{a.approveTitle}</DialogTitle>
          <DialogDescription>{a.approveDescription}</DialogDescription>
        </DialogHeader>

        <dl className="grid gap-1 rounded-xl border border-line bg-canvas px-4 py-3 text-[13px]">
          <div className="flex justify-between gap-3"><dt className="text-ink-3">Nome</dt><dd className="text-right font-medium text-ink">{signup.firstName} {signup.lastName}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-ink-3">E-mail</dt><dd className="truncate text-ink">{signup.email}</dd></div>
          {details(signup) && <div className="flex justify-between gap-3"><dt className="text-ink-3">Dados</dt><dd className="text-right text-ink">{details(signup)}</dd></div>}
        </dl>

        {signup.healthDescription ? (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-medium text-ink">{a.healthText}</p>
            <blockquote className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-[13px] whitespace-pre-wrap text-ink">
              {signup.healthDescription}
            </blockquote>
            {signup.consentAt && <p className="text-xs text-ink-3">{a.healthConsentAt(formatDate(signup.consentAt))}</p>}
          </div>
        ) : (
          <p className="text-xs text-ink-3">{a.noHealthConsent}</p>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="approve-trainer">{messages.studentForm.trainer}</Label>
            <TrainerSelect id="approve-trainer" value={trainerId} onChange={setTrainerId} trainers={trainers} />
          </div>
          {canClassify && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="approve-groups">{messages.studentForm.groups}</Label>
              <GroupsField id="approve-groups" groups={groups} value={groupIds} onChange={setGroupIds} onGroupCreated={onGroupCreated} />
            </div>
          )}
        </div>

        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>{messages.students.confirm.cancel}</Button>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await approveSignup(signup.id, trainerId || null, groupIds);
                if (!r.ok) return setError(r.planLimit ? `${r.error} ${a.limitHint}` : r.error);
                toast.success(r.message);
                onClose();
              })
            }
          >
            {a.approve}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
