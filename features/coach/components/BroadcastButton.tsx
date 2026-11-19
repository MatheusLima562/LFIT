"use client";

import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { messages } from "@/messages/pt-BR";
import { AnnouncementEditor } from "./AnnouncementEditor";
import type { StaffAnnouncement } from "../queries";

const t = messages.coach.announcement;

/** "Recado para todos os meus alunos" na caixa de conversas do professor. */
export function BroadcastButton({ current }: { current: StaffAnnouncement | null }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Megaphone aria-hidden />
          {t.open}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.titleAll}</DialogTitle>
          <DialogDescription>{t.hintAll}</DialogDescription>
        </DialogHeader>
        <AnnouncementEditor studentId={null} current={current} compact />
      </DialogContent>
    </Dialog>
  );
}
