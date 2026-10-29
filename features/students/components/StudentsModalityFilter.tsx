import Link from "next/link";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { MODALITIES, type Modality } from "../modality";
import { studentListHref, type StudentListParams } from "../search-params";

const t = messages.students;

/** Filtro de modalidade como links (estado na URL, `?modalidade=`), como o filtro de treino. */
export function StudentsModalityFilter({ params }: { params: StudentListParams }) {
  const chip = (value: Modality | undefined, label: string) => {
    const current = params.modalidade === value;
    return (
      <Link
        key={value ?? "all"}
        href={studentListHref({ ...params, modalidade: value, page: 1 })}
        aria-current={current ? "true" : undefined}
        scroll={false}
        className={cn(
          "inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
          current ? "border-selected-line bg-selected-soft font-medium text-ink" : "border-line bg-surface text-ink-2 hover:text-ink",
        )}
      >
        {label}
      </Link>
    );
  };
  return (
    <nav aria-label={t.modalityFilter.label} className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] font-medium text-ink-2">{t.modalityFilter.label}:</span>
      {chip(undefined, t.modalityFilter.all)}
      {MODALITIES.map((m) => chip(m, t.modality[m]))}
    </nav>
  );
}
