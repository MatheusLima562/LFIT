"use client";

import Link from "next/link";
import { CalendarClock, MessageCircle, PauseCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { messages } from "@/messages/pt-BR";
import type { InactiveStudent } from "../pause";
import { PauseDialog } from "./PauseDialog";

const t = messages.absence;

/** Início: "Sem treinar há 7+ dias" — mensagem pelo chat ou pausa. Só nome e dias (nada de saúde). */
export function InactiveStudentsCard({ students }: { students: InactiveStudent[] }) {
  const [pausing, setPausing] = useState<InactiveStudent | null>(null);
  return (
    <section aria-labelledby="card-inactive" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div>
        <h2 id="card-inactive" className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <CalendarClock aria-hidden className="size-4 text-ink-3" />
          {t.title}
        </h2>
        <p className="mt-0.5 text-xs text-ink-3">{t.hint}</p>
      </div>
      {students.length === 0 ? (
        <p className="text-sm text-ink-2">{t.empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {students.map((s) => {
            const name = `${s.firstName} ${s.lastName}`.trim();
            return (
              <li key={s.studentId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{name}</span>
                  <span className="block text-xs text-ink-3">{s.lastSessionAt ? t.days(s.daysSince) : `${t.never} · ${t.days(s.daysSince)}`}</span>
                </span>
                <span className="flex gap-1.5">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/chat?aluno=${s.studentId}`} aria-label={t.messageLabel(name)}>
                      <MessageCircle aria-hidden />
                      {t.message}
                    </Link>
                  </Button>
                  <Button type="button" variant="outline" size="sm" aria-label={t.pauseLabel(name)} onClick={() => setPausing(s)}>
                    <PauseCircle aria-hidden />
                    {t.pause}
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {pausing && (
        <PauseDialog studentId={pausing.studentId} name={pausing.firstName} open onOpenChange={(o) => !o && setPausing(null)} />
      )}
    </section>
  );
}
