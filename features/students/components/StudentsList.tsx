import { formatEnrollment } from "@/lib/format";
import { messages } from "@/messages/pt-BR";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import type { StudentRow } from "../queries";
import { AgeSex, StudentGroups, StudentIdentity, StudentStatus } from "./StudentCells";
import { StudentRowActions } from "./StudentRowActions";

const c = messages.students.columns;

const columns: DataTableColumn<StudentRow>[] = [
  { id: "student", header: c.student, cell: (s) => <StudentIdentity student={s} showEnrollment={false} />, className: "min-w-52" },
  {
    id: "enrollment",
    header: c.enrollment,
    cell: (s) => <span className="tabular text-[13px] text-ink-2">{formatEnrollment(s.enrollmentNumber)}</span>,
  },
  {
    id: "email",
    header: c.email,
    cell: (s) => <span className="block max-w-60 truncate text-[13px] text-ink-2">{s.email}</span>,
    hideBelow: "xl",
  },
  { id: "age", header: c.ageSex, cell: (s) => <AgeSex student={s} />, hideBelow: "lg" },
  {
    id: "trainer",
    header: c.trainer,
    cell: (s) => (
      <span className="text-[13px] whitespace-nowrap text-ink-2">{s.trainerName ?? messages.students.noTrainer}</span>
    ),
    hideBelow: "lg",
  },
  { id: "status", header: c.status, cell: (s) => <StudentStatus student={s} /> },
  { id: "groups", header: c.groups, cell: (s) => <StudentGroups student={s} />, hideBelow: "md" },
  {
    id: "actions",
    header: <span className="sr-only">{c.actions}</span>,
    cell: (s) => <StudentRowActions student={s} />,
    className: "w-px text-right",
  },
];

export function StudentsList({ rows }: { rows: StudentRow[] }) {
  return <DataTable columns={columns} rows={rows} getRowId={(s) => s.id} caption={messages.students.title} />;
}
