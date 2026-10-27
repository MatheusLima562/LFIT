"use client";

import { useId, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  /** Se informado, o botão só habilita quando o texto digitado bate (sem diferenciar maiúsculas). */
  requireText?: { expected: string; label: string };
  onConfirm: (typed: string) => void;
}

/** Confirmação de ações sensíveis. Com `requireText`, exige digitar (ex.: o nome do aluno). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  destructive,
  pending,
  requireText,
  onConfirm,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const inputId = useId();
  const matches = !requireText || typed.trim().toLowerCase() === requireText.expected.trim().toLowerCase();

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTyped("");
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {requireText && (
          <div className="flex flex-col gap-2">
            <Label htmlFor={inputId}>{requireText.label}</Label>
            <Input id={inputId} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          {/* Button comum (não AlertDialogAction) para o diálogo só fechar quando a ação terminar. */}
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={!matches || pending}
            onClick={() => onConfirm(typed)}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
