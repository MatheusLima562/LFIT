"use client";

import {
  Ban,
  CalendarX2,
  CircleCheck,
  Link2,
  MailPlus,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Trash2,
  TimerOff,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  changeStudentStatus,
  createAccessLink,
  deleteStudent,
  resendInvite,
  type StudentActionResult,
  type StudentStatusAction,
} from "../actions";
import type { StudentRow } from "../queries";

const t = messages.students;

type Pending = null | "deactivate" | "expire" | "delete";

function whatsappHref(student: StudentRow) {
  if (!student.whatsapp) return null;
  const text = encodeURIComponent(t.menu.whatsappGreeting(student.firstName));
  return `https://wa.me/${student.whatsapp.replace(/\D/g, "")}?text=${text}`;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function StudentRowActions({ student }: { student: StudentRow }) {
  const [confirm, setConfirm] = useState<Pending>(null);
  const [pending, startTransition] = useTransition();
  const wa = whatsappHref(student);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const editParams = new URLSearchParams(searchParams);
  editParams.delete("novo");
  editParams.set("editar", student.id);
  const editHref = `${pathname}?${editParams}`;

  const report = (result: StudentActionResult) => {
    if (result.ok) toast.success(result.message);
    else toast.error(result.error);
    return result.ok;
  };

  const runStatus = (action: StudentStatusAction) =>
    startTransition(async () => {
      if (report(await changeStudentStatus(action, student.id))) setConfirm(null);
    });

  const copyLink = () =>
    startTransition(async () => {
      const result = await createAccessLink(student.id);
      if (!result.ok || !result.url) return void report(result);
      if (await copyToClipboard(result.url)) toast.success(result.message);
      else toast.message(t.actions.linkCopyFailed, { description: result.url, duration: 30_000 });
    });

  return (
    <div className="flex items-center justify-end gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          {wa ? (
            <Button asChild variant="ghost" size="icon-sm" className="text-ink-3 hover:text-emerald-700">
              <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`${t.menu.whatsapp}: ${student.fullName}`}>
                <MessageCircle aria-hidden />
              </a>
            </Button>
          ) : (
            <span tabIndex={0} aria-label={t.menu.whatsappMissing} className="grid size-7 place-items-center rounded-lg text-ink-3/50">
              <MessageCircle aria-hidden className="size-4" />
            </span>
          )}
        </TooltipTrigger>
        <TooltipContent>{wa ? t.menu.whatsapp : t.menu.whatsappMissing}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="ghost" size="icon-sm" className="text-ink-3 hover:text-ink">
            <Link href={editHref} scroll={false} aria-label={`${t.menu.edit}: ${student.fullName}`}>
              <Pencil aria-hidden />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t.menu.edit}</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t.menu.label(student.fullName)} disabled={pending} className="text-ink-2">
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={copyLink}>
            <Link2 aria-hidden />
            {t.menu.copyLink}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => startTransition(async () => void report(await resendInvite(student.id)))}>
            <MailPlus aria-hidden />
            {t.menu.resendInvite}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {student.status === "inactive" ? (
            <DropdownMenuItem onSelect={() => runStatus("reactivate")}>
              <CircleCheck aria-hidden />
              {t.menu.reactivate}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setConfirm("deactivate")}>
              <Ban aria-hidden />
              {t.menu.deactivate}
            </DropdownMenuItem>
          )}
          {student.status !== "expired" && (
            <DropdownMenuItem onSelect={() => setConfirm("expire")}>
              <TimerOff aria-hidden />
              {t.menu.expire}
            </DropdownMenuItem>
          )}
          {student.accessExpiresAt && (
            <DropdownMenuItem onSelect={() => runStatus("clearExpiration")}>
              <CalendarX2 aria-hidden />
              {t.menu.clearExpiration}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}>
            <Trash2 aria-hidden />
            {t.menu.delete}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirm === "deactivate"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t.confirm.deactivateTitle}
        description={t.confirm.deactivateText}
        confirmLabel={t.menu.deactivate}
        cancelLabel={t.confirm.cancel}
        pending={pending}
        onConfirm={() => runStatus("deactivate")}
      />
      <ConfirmDialog
        open={confirm === "expire"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t.confirm.expireTitle}
        description={t.confirm.expireText}
        confirmLabel={t.menu.expire}
        cancelLabel={t.confirm.cancel}
        pending={pending}
        onConfirm={() => runStatus("expire")}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t.confirm.deleteTitle}
        description={t.confirm.deleteText(student.fullName)}
        confirmLabel={t.menu.delete}
        cancelLabel={t.confirm.cancel}
        destructive
        pending={pending}
        requireText={{ expected: student.fullName, label: t.confirm.deleteLabel }}
        onConfirm={(typed) =>
          startTransition(async () => {
            if (report(await deleteStudent(student.id, typed))) setConfirm(null);
          })
        }
      />
    </div>
  );
}

