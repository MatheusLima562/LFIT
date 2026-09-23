import type { Metadata } from "next";
import { Globe, SearchX, UserPlus, Users } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { getOrganizationPlanUsage } from "@/features/organizations/queries";
import { getStudentFilterOptions, getStudentTabCounts, listStudents } from "@/features/students/queries";
import { parseStudentListParams } from "@/features/students/search-params";
import { StudentsCards } from "@/features/students/components/StudentsCards";
import { StudentsList } from "@/features/students/components/StudentsList";
import { StudentsPagination } from "@/features/students/components/StudentsPagination";
import { StudentsTabs } from "@/features/students/components/StudentsTabs";
import { StudentsToolbar } from "@/features/students/components/StudentsToolbar";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const t = messages.students;

export const metadata: Metadata = { title: t.title };

async function getViewPreference(userId: string): Promise<"list" | "cards"> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("preferences").eq("id", userId).single();
  const prefs = (data?.preferences ?? {}) as { studentsView?: string };
  return prefs.studentsView === "cards" ? "cards" : "list";
}

/** Botão de funcionalidade de etapa futura: visível, desabilitado e explicado. */
function SoonButton({ icon, label, variant }: { icon: React.ReactNode; label: string; variant?: "outline" }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          <Button variant={variant} disabled aria-label={`${label} (${messages.app.soon})`}>
            {icon}
            <span className="hidden sm:inline">{label}</span>
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{messages.app.soon}</TooltipContent>
    </Tooltip>
  );
}

export default async function StudentsPage({ searchParams }: PageProps<"/alunos">) {
  const session = await requireStaff();
  const params = parseStudentListParams(await searchParams);

  const [{ rows, total }, counts, plan, filters, view] = await Promise.all([
    listStudents(params),
    getStudentTabCounts(),
    getOrganizationPlanUsage(),
    getStudentFilterOptions(),
    getViewPreference(session.userId),
  ]);

  const filtered = Boolean(params.q || params.turma || params.grupo);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-[22px]">{t.title}</h1>
          <p className="tabular mt-0.5 text-[13px] text-ink-2">{t.counter(plan.used, plan.limit)}</p>
        </div>
        <div className="flex items-center gap-2">
          <SoonButton icon={<Globe aria-hidden />} label={t.publicSignups} variant="outline" />
          <SoonButton icon={<UserPlus aria-hidden />} label={t.add} />
        </div>
      </header>

      <StudentsTabs params={params} counts={counts} />

      <StudentsToolbar params={params} view={view} classes={filters.classes} groups={filters.groups} />

      {rows.length === 0 ? (
        <EmptyState
          icon={filtered ? <SearchX /> : <Users />}
          message={filtered ? t.empty.search : t.empty[params.status]}
          className="min-h-64 bg-surface"
        />
      ) : (
        <>
          {/* Mobile: sempre cards. A partir de md: preferência do usuário. */}
          <StudentsCards rows={rows} className={view === "cards" ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "grid gap-3 sm:grid-cols-2 md:hidden"} />
          {view === "list" && (
            <div className="hidden md:block">
              <StudentsList rows={rows} />
            </div>
          )}
          <StudentsPagination params={params} total={total} />
        </>
      )}
    </div>
  );
}
