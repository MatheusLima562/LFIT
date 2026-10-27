import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";

export interface DataTableColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Esconde a coluna abaixo deste breakpoint (tabela responsiva). */
  hideBelow?: "md" | "lg" | "xl";
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  caption: string;
  className?: string;
}

const hide = { md: "hidden md:table-cell", lg: "hidden lg:table-cell", xl: "hidden xl:table-cell" };

/**
 * Tabela genérica e sem estado (paginação/ordenação ficam na URL, no servidor).
 * Server Component: as células podem conter Client Components (ex.: menu de ações).
 */
export function DataTable<T>({ columns, rows, getRowId, caption, className }: DataTableProps<T>) {
  return (
    <div className={cn("overflow-x-auto rounded-2xl border border-line bg-surface shadow-card", className)}>
      <Table>
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((col) => (
              <TableHead
                key={col.id}
                scope="col"
                className={cn(
                  "h-10 bg-canvas/60 text-[11px] font-semibold tracking-wider text-ink-3 uppercase first:pl-4 last:pr-4",
                  col.hideBelow && hide[col.hideBelow],
                  col.className,
                )}
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={getRowId(row)} className="border-line hover:bg-canvas/50">
              {columns.map((col) => (
                <TableCell
                  key={col.id}
                  className={cn("py-2.5 first:pl-4 last:pr-4", col.hideBelow && hide[col.hideBelow], col.className)}
                >
                  {col.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
