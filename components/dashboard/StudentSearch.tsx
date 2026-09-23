"use client";

import { useRouter } from "next/navigation";
import { Search, UserSearch } from "lucide-react";
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import type { SearchableStudent } from "@/types/dashboard";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/Avatar";

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const MAX_RESULTS = 6;

export function StudentSearch({ students }: { students: SearchableStudent[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const deferredQuery = useDeferredValue(query);

  const index = useMemo(
    () => students.map((s) => ({ ...s, haystack: normalize(`${s.name} ${s.email}`) })),
    [students],
  );

  const results = useMemo(() => {
    const q = normalize(deferredQuery.trim());
    if (!q) return index.slice(0, MAX_RESULTS);
    return index.filter((s) => s.haystack.includes(q)).slice(0, MAX_RESULTS);
  }, [deferredQuery, index]);

  // Atalho global ⌘K / Ctrl+K
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const select = (student: SearchableStudent) => {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    router.push(`/alunos?aluno=${student.id}`);
  };

  const showList = open && results.length > 0;
  const showEmpty = open && results.length === 0 && deferredQuery.trim().length > 0;
  const current = Math.min(activeIndex, results.length - 1);

  return (
    <div className="relative w-full md:w-64 xl:w-72">
      <label htmlFor={`${listId}-input`} className="sr-only">
        Buscar aluno
      </label>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
      <input
        ref={inputRef}
        id={`${listId}-input`}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listId}-opt-${current}` : undefined}
        placeholder="Buscar aluno"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            const delta = e.key === "ArrowDown" ? 1 : -1;
            setActiveIndex((i) => (i + delta + results.length) % Math.max(results.length, 1));
          } else if (e.key === "Enter" && showList) {
            e.preventDefault();
            select(results[current]);
          } else if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
        className="h-10 w-full rounded-xl border border-line bg-surface pr-12 pl-9 text-sm text-ink shadow-card outline-none transition-colors placeholder:text-ink-3 hover:border-line-strong focus:border-brand-300 focus:ring-3 focus:ring-brand-500/15"
      />
      <kbd
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded-md border border-line bg-canvas px-1.5 py-0.5 font-sans text-[11px] font-medium text-ink-3 sm:block"
      >
        ⌘K
      </kbd>

      {(showList || showEmpty) && (
        <div className="absolute top-full right-0 left-0 z-40 mt-2 min-w-72 overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
          <p className="border-b border-line px-3 py-2 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">
            {deferredQuery.trim() ? "Resultados" : "Alunos"}
          </p>
          {showEmpty ? (
            <div className="flex items-center gap-2.5 px-3 py-4 text-[13px] text-ink-2">
              <UserSearch aria-hidden className="size-4 text-ink-3" />
              Nenhum aluno encontrado para “{deferredQuery.trim()}”.
            </div>
          ) : (
            <ul id={listId} role="listbox" aria-label="Alunos" className="max-h-80 overflow-y-auto p-1.5">
              {results.map((student, i) => (
                <li
                  key={student.id}
                  id={`${listId}-opt-${i}`}
                  role="option"
                  aria-selected={i === current}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(student)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5",
                    i === current && "bg-canvas",
                  )}
                >
                  <Avatar name={student.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{student.name}</span>
                    <span className="block truncate text-xs text-ink-3">{student.email}</span>
                  </span>
                  {student.status === "inactive" && (
                    <span className="rounded-md bg-canvas px-1.5 py-0.5 text-[10px] font-medium text-ink-2 ring-1 ring-line">
                      Inativo
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
