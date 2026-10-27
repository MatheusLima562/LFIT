import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { PAGE_SIZE, studentListHref, type StudentListParams } from "../search-params";

export function StudentsPagination({ params, total }: { params: StudentListParams; total: number }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total === 0) return null;
  const from = (params.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(params.page * PAGE_SIZE, total);

  const pageLink = (page: number, label: string, icon: React.ReactNode, disabled: boolean) =>
    disabled ? (
      <span aria-disabled="true" className={cn(buttonVariants({ variant: "outline", size: "icon" }), "pointer-events-none opacity-40")}>
        {icon}
        <span className="sr-only">{label}</span>
      </span>
    ) : (
      <Link href={studentListHref({ ...params, page })} aria-label={label} className={buttonVariants({ variant: "outline", size: "icon" })}>
        {icon}
      </Link>
    );

  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-3">
      <p className="tabular text-[13px] text-ink-2">{messages.students.pagination(from, to, total)}</p>
      <div className="flex items-center gap-2">
        {pageLink(params.page - 1, "Página anterior", <ChevronLeft aria-hidden />, params.page <= 1)}
        <span className="tabular text-[13px] text-ink-2">
          {params.page} / {pages}
        </span>
        {pageLink(params.page + 1, "Próxima página", <ChevronRight aria-hidden />, params.page >= pages)}
      </div>
    </nav>
  );
}
