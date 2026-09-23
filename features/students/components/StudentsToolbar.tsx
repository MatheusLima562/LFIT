"use client";

import { Download, FileSpreadsheet, LayoutGrid, List, Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { messages } from "@/messages/pt-BR";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setStudentsView } from "../actions";
import { STUDENT_SORTS, studentListHref, type StudentListParams } from "../search-params";

const t = messages.students;
const ALL = "all";

interface StudentsToolbarProps {
  params: StudentListParams;
  view: "list" | "cards";
  classes: { id: string; name: string }[];
  groups: { id: string; name: string; color: string }[];
}

export function StudentsToolbar({ params, view, classes, groups }: StudentsToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(params.q ?? "");
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const navigate = (patch: Partial<StudentListParams>) =>
    startTransition(() => router.replace(studentListHref({ ...params, page: 1, ...patch }, pathname), { scroll: false }));

  // Busca com debounce de 300 ms (a consulta roda no servidor).
  useEffect(() => {
    const current = params.q ?? "";
    if (query.trim() === current) return;
    const timer = setTimeout(() => navigate({ q: query.trim() || undefined }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dispara só quando o texto muda
  }, [query]);

  const exportHref = (format: "csv" | "xlsx") => {
    const href = studentListHref({ ...params, page: 1 }, "/alunos/exportar");
    return `${href}${href.includes("?") ? "&" : "?"}format=${format}`;
  };

  const hasFilters = Boolean(params.q || params.turma || params.grupo);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div role="search" className="relative min-w-0 flex-1 lg:max-w-sm">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
        <Input
          ref={inputRef}
          type="search"
          aria-label={t.searchLabel}
          placeholder={t.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 rounded-xl bg-surface pl-9 shadow-card"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={params.turma ?? ALL} onValueChange={(v) => navigate({ turma: v === ALL ? undefined : v })}>
          <SelectTrigger aria-label={t.filters.class} className="h-9 w-[10.5rem] rounded-xl bg-surface shadow-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t.filters.allClasses}</SelectItem>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={params.grupo ?? ALL} onValueChange={(v) => navigate({ grupo: v === ALL ? undefined : v })}>
          <SelectTrigger aria-label={t.filters.group} className="h-9 w-[10.5rem] rounded-xl bg-surface shadow-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t.filters.allGroups}</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: g.color }} />
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={params.sort} onValueChange={(v) => navigate({ sort: v as StudentListParams["sort"] })}>
          <SelectTrigger aria-label={t.sort.label} className="h-9 w-[12.5rem] rounded-xl bg-surface shadow-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STUDENT_SORTS.map((s) => (
              <SelectItem key={s} value={s}>
                {t.sort[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            onClick={() => {
              setQuery("");
              navigate({ q: undefined, turma: undefined, grupo: undefined });
            }}
            className="text-ink-2"
          >
            <X aria-hidden />
            {t.filters.clear}
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2 lg:ml-2">
          <div role="group" aria-label={t.view.label} className="hidden rounded-xl border border-line bg-surface p-0.5 shadow-card md:flex">
            {(["list", "cards"] as const).map((v) => {
              const Icon = v === "list" ? List : LayoutGrid;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  aria-label={t.view[v]}
                  onClick={() => startTransition(() => setStudentsView(v))}
                  className={cn(
                    "grid size-8 place-items-center rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                    view === v ? "bg-brand-50 text-brand-700" : "text-ink-3 hover:text-ink",
                  )}
                >
                  <Icon aria-hidden className="size-4" />
                </button>
              );
            })}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download aria-hidden />
                {t.export}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <a href={exportHref("csv")} download>
                  <FileSpreadsheet aria-hidden />
                  {t.exportCsv}
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={exportHref("xlsx")} download>
                  <FileSpreadsheet aria-hidden />
                  {t.exportXlsx}
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
