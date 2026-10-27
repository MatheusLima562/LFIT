import { KeyRound, ShieldCheck } from "lucide-react";
import type { StudentRef } from "@/types/dashboard";
import { Avatar } from "@/components/ui/Avatar";
import { Card, CardFooter, CardHeader, CardIcon, CardLink } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export function ExpiringAccessCard({ students, count = students.length }: { students: StudentRef[]; count?: number }) {
  return (
    <Card labelledBy="card-access" className="h-full">
      <CardHeader
        id="card-access"
        title="Acesso expirando"
        icon={<CardIcon><KeyRound /></CardIcon>}
        action={
          count > 0 ? (
            <span className="tabular rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning-ink ring-1 ring-warning-line">
              {count}
            </span>
          ) : undefined
        }
      />
      {students.length === 0 ? (
        <EmptyState icon={<ShieldCheck />} message="Nenhum aluno com acesso expirando nos próximos 7 dias." />
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {students.map((s) => (
            <li key={s.id} className="flex items-center gap-2.5 py-2 first:pt-0">
              <Avatar name={s.name} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{s.name}</span>
              {s.meta && <span className="shrink-0 text-xs font-medium text-warning-ink">{s.meta}</span>}
            </li>
          ))}
        </ul>
      )}
      <CardFooter>
        <CardLink href="/alunos?sort=expires:asc">Ver todos</CardLink>
      </CardFooter>
    </Card>
  );
}
