import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { isoToBR, timestampToISODate } from "@/lib/dates";
import { messages } from "@/messages/pt-BR";
import { redFlagLabel, type RedFlagCheck } from "../red-flags";

const t = messages.redFlags;

/** Aviso no montador (nível completo de saúde): sinais na última triagem e nenhuma liberação. Não bloqueia. */
export function RedFlagBanner({ studentId, check }: { studentId: string; check: RedFlagCheck }) {
  return (
    <div role="status" className="flex items-start gap-2 rounded-2xl border border-warning-line bg-warning-soft px-4 py-3 text-[13px] text-warning-ink">
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-semibold">{t.builderTitle}</p>
        <ul className="mt-1 list-disc pl-5">
          {check.items.map((k) => (
            <li key={k}>{redFlagLabel(k)}</li>
          ))}
        </ul>
        <p className="mt-1">{t.builderText(isoToBR(timestampToISODate(check.recordedAt)))}</p>
        <Link href={`/alunos?editar=${studentId}&foco=triagem`} className="mt-1 inline-block rounded link">
          {t.builderLink}
        </Link>
      </div>
    </div>
  );
}

/** Aviso restrito (professor do plano sem acesso à saúde): sem sinais, sem observação, sem link para o cadastro. */
export function RestrictedRedFlagBanner() {
  return (
    <p role="status" className="flex items-start gap-2 rounded-2xl border border-warning-line bg-warning-soft px-4 py-3 text-[13px] text-warning-ink">
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span className="font-semibold">{t.builderRestricted}</span>
    </p>
  );
}
