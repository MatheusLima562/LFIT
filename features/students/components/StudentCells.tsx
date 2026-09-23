import { ageFrom, formatDate, formatEnrollment } from "@/lib/format";
import { messages } from "@/messages/pt-BR";
import { GroupChip } from "@/components/students/GroupChip";
import { StatusBadge } from "@/components/students/StatusBadge";
import { StudentAvatar } from "@/components/students/StudentAvatar";
import type { StudentRow } from "../queries";

const t = messages.students;

/** Peças de exibição compartilhadas entre a lista e os cards. */

export function StudentIdentity({ student, showEnrollment = true }: { student: StudentRow; showEnrollment?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <StudentAvatar name={student.fullName} photoUrl={student.photoUrl} size="lg" />
      <div className="min-w-0">
        <p className="truncate text-[13.5px] font-semibold text-ink">{student.fullName}</p>
        {showEnrollment && (
          <p className="tabular truncate text-xs text-ink-3">{formatEnrollment(student.enrollmentNumber)}</p>
        )}
      </div>
    </div>
  );
}

export function AgeSex({ student }: { student: StudentRow }) {
  const parts = [
    student.birthDate ? `${ageFrom(student.birthDate)} anos` : null,
    student.sex ? t.sex[student.sex] : null,
  ].filter(Boolean);
  return <span className="text-[13px] whitespace-nowrap text-ink-2">{parts.length ? parts.join(" · ") : "—"}</span>;
}

export function StudentStatus({ student }: { student: StudentRow }) {
  const expires = student.accessExpiresAt;
  return (
    <div className="flex flex-col items-start gap-0.5">
      <StatusBadge status={student.status} />
      {expires && (
        <span className="text-[11px] whitespace-nowrap text-ink-3">
          {student.status === "expired" ? t.expiredOn(formatDate(expires)) : t.expiresOn(formatDate(expires))}
        </span>
      )}
    </div>
  );
}

export function StudentGroups({ student }: { student: StudentRow }) {
  if (student.groups.length === 0) return <span className="text-[13px] text-ink-3">—</span>;
  return (
    <div className="flex max-w-56 flex-wrap gap-1">
      {student.groups.map((g) => (
        <GroupChip key={g.name} name={g.name} color={g.color} />
      ))}
    </div>
  );
}
