"use client";

import { BookOpen, ClipboardCheck, HeartPulse } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { messages } from "@/messages/pt-BR";
import { RedFlagCheckDialog } from "./RedFlagTriage";
import type { StudentHealthGuides } from "../queries";
import { GuideView } from "./GuideView";

const t = messages.guides;
const tRedFlags = messages.redFlags;

interface StudentConditionsPanelProps {
  health: StudentHealthGuides | null;
  studentId: string;
  /** Owner ou professor responsável (base legal própria, independe do consentimento de saúde). */
  canRegisterRedFlag: boolean;
}

/** Condições do aluno com o botão "Guia" (nível completo de saúde) + atalho "Registrar triagem". */
export function StudentConditionsPanel({ health, studentId, canRegisterRedFlag }: StudentConditionsPanelProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const guide = openKey ? health?.guides[openKey] : null;
  const conditions = health?.conditions ?? [];
  if (!conditions.length && !canRegisterRedFlag) return null;

  return (
    <section aria-labelledby="student-conditions-title" className="rounded-2xl border border-line bg-surface px-4 py-3 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="student-conditions-title" className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <HeartPulse aria-hidden className="size-4 text-ink-3" />
            {t.panelTitle}
          </h2>
          <p className="text-xs text-ink-3">{t.panelHint}</p>
        </div>
        {canRegisterRedFlag && (
          <Button type="button" variant="outline" size="sm" onClick={() => setCheckOpen(true)}>
            <ClipboardCheck aria-hidden />
            {tRedFlags.record}
          </Button>
        )}
      </div>
      {!conditions.length && <p className="mt-2 text-[13px] text-ink-2">{t.noConditions}</p>}
      {conditions.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {conditions.map((c) => (
            <li key={c.id} className="flex items-center gap-1 rounded-full border border-line bg-canvas py-0.5 pl-3 pr-1 text-[13px] text-ink">
              {c.name}
              {c.guideKey && health?.guides[c.guideKey] ? (
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
      )}

      <Sheet open={guide != null} onOpenChange={(open) => !open && setOpenKey(null)}>
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

      {checkOpen && <RedFlagCheckDialog studentId={studentId} onClose={() => setCheckOpen(false)} />}
    </section>
  );
}
