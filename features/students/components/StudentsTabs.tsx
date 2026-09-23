import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { messages } from "@/messages/pt-BR";
import { STUDENT_TABS, studentListHref, type StudentListParams } from "../search-params";

interface StudentsTabsProps {
  params: StudentListParams;
  counts: Record<StudentListParams["status"], number>;
}

/** Abas Ativos/Inativos/Expirados como links (estado na URL, funciona sem JS). */
export function StudentsTabs({ params, counts }: StudentsTabsProps) {
  return (
    <nav aria-label="Situação dos alunos" className="-mb-px flex gap-1 overflow-x-auto border-b border-line">
      {STUDENT_TABS.map((tab) => {
        const current = params.status === tab;
        return (
          <Link
            key={tab}
            href={studentListHref({ ...params, status: tab, page: 1 })}
            aria-current={current ? "page" : undefined}
            scroll={false}
            className={cn(
              "relative inline-flex h-10 shrink-0 items-center gap-2 rounded-t-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
              current
                ? "text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand-500"
                : "text-ink-2 hover:text-ink",
            )}
          >
            {messages.students.tabs[tab]}
            <span
              className={cn(
                "tabular rounded-full px-1.5 py-px text-xs",
                current ? "bg-brand-50 text-brand-700" : "bg-canvas text-ink-3",
              )}
            >
              {formatNumber(counts[tab])}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
