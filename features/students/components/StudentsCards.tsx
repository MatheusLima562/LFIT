import { messages } from "@/messages/pt-BR";
import type { StudentRow } from "../queries";
import { AgeSex, StudentGroups, StudentIdentity, StudentStatus } from "./StudentCells";
import { StudentRowActions } from "./StudentRowActions";

/** Visualização em cards (também usada sempre no mobile). */
export function StudentsCards({ rows, className }: { rows: StudentRow[]; className?: string }) {
  return (
    <ul className={className ?? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3"}>
      {rows.map((s) => (
        <li key={s.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
          <div className="flex items-start justify-between gap-2">
            <StudentIdentity student={s} />
            <StudentRowActions student={s} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StudentStatus student={s} />
            <AgeSex student={s} />
          </div>
          <dl className="grid gap-1 border-t border-line pt-3 text-[13px]">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-3">{messages.students.columns.trainer}</dt>
              <dd className="truncate text-ink-2">{s.trainerName ?? messages.students.noTrainer}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-3">{messages.students.columns.email}</dt>
              <dd className="truncate text-ink-2">{s.email}</dd>
            </div>
          </dl>
          {s.groups.length > 0 && <StudentGroups student={s} />}
        </li>
      ))}
    </ul>
  );
}
