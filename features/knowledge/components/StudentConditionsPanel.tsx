"use client";

import { BookOpen, HeartPulse } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { messages } from "@/messages/pt-BR";
import type { StudentHealthGuides } from "../queries";
import { GuideView } from "./GuideView";

const t = messages.guides;

/** Condições do aluno com o botão "Guia" (renderizado só no nível completo de saúde). */
export function StudentConditionsPanel({ health }: { health: StudentHealthGuides }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const guide = openKey ? health.guides[openKey] : null;
  if (!health.conditions.length) return null;

  return (
    <section aria-labelledby="student-conditions-title" className="rounded-2xl border border-line bg-surface px-4 py-3 shadow-card">
      <h2 id="student-conditions-title" className="flex items-center gap-2 text-[13px] font-semibold text-ink">
        <HeartPulse aria-hidden className="size-4 text-ink-3" />
        {t.panelTitle}
      </h2>
      <p className="text-xs text-ink-3">{t.panelHint}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {health.conditions.map((c) => (
          <li key={c.id} className="flex items-center gap-1 rounded-full border border-line bg-canvas py-0.5 pl-3 pr-1 text-[13px] text-ink">
            {c.name}
            {c.guideKey && health.guides[c.guideKey] ? (
              <Button variant="ghost" size="xs" aria-label={t.openFor(c.name)} onClick={() => setOpenKey(c.guideKey)}>
                <BookOpen aria-hidden />
                {t.open}
              </Button>
            ) : (
              <span className="px-2 text-xs text-ink-3">{t.noGuide}</span>
            )}
          </li>
        ))}
      </ul>

      <Sheet open={guide !== null} onOpenChange={(open) => !open && setOpenKey(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto data-[side=right]:sm:max-w-2xl">
          {guide && (
            <>
              <SheetHeader>
                <SheetTitle>{t.title(guide.title)}</SheetTitle>
                <SheetDescription className="sr-only">{t.disclaimer}</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">
                <GuideView guide={guide} idPrefix="sheet" />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
