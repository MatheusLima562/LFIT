import type { Metadata } from "next";
import { Globe, SearchX, UserPlus, Users } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { getOrganizationPlanUsage } from "@/features/organizations/queries";
import Link from "next/link";
import { z } from "zod";
import {
  getStudentFilterOptions,
  getStudentForEdit,
  getStudentFormOptions,
  getStudentTabCounts,
  listStudents,
} from "@/features/students/queries";
import { parseStudentListParams, studentListHref } from "@/features/students/search-params";
import { StudentFormDialog } from "@/features/students/components/StudentFormDialog";
import { countPendingSignups } from "@/features/signup/queries";
import { StudentsCards } from "@/features/students/components/StudentsCards";
import { StudentsList } from "@/features/students/components/StudentsList";
import { StudentsPagination } from "@/features/students/components/StudentsPagination";
import { StudentsTabs } from "@/features/students/components/StudentsTabs";
import { StudentsToolbar } from "@/features/students/components/StudentsToolbar";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";

const t = messages.students;

export const metadata: Metadata = { title: t.title };

async function getViewPreference(userId: string): Promise<"list" | "cards"> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("preferences").eq("id", userId).single();
  const prefs = (data?.preferences ?? {}) as { studentsView?: string };
  return prefs.studentsView === "cards" ? "cards" : "list";
}

/** Modal controlado pela URL: ?novo=1 ou ?editar=<id>. */
function parseDialog(raw: Record<string, string | string[] | undefined>) {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const editId = z.uuid().safeParse(first(raw.editar));
  if (editId.success) return { mode: "edit" as const, id: editId.data };
  if (first(raw.novo) === "1") return { mode: "create" as const, id: null };
  return null;
}

export default async function StudentsPage({ searchParams }: PageProps<"/alunos">) {
  const session = await requireStaff();
  const raw = await searchParams;
  const params = parseStudentListParams(raw);
  const dialog = parseDialog(raw);
  const listHref = studentListHref(params);
  const newHref = `${listHref}${listHref.includes("?") ? "&" : "?"}novo=1`;

  const [{ rows, total }, counts, plan, filters, view, pendingSignups] = await Promise.all([
    listStudents(params),
    getStudentTabCounts(),
    getOrganizationPlanUsage(),
    getStudentFilterOptions(),
    getViewPreference(session.userId),
    session.role === "owner" ? countPendingSignups() : Promise.resolve(0),
  ]);

  const [formOptions, editing] = dialog
    ? await Promise.all([getStudentFormOptions(), dialog.id ? getStudentForEdit(dialog.id) : Promise.resolve(null)])
    : [null, null];

  const filtered = Boolean(params.q || params.turma || params.grupo);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-[22px]">{t.title}</h1>
          <p className="tabular mt-0.5 text-[13px] text-ink-2">{t.counter(plan.used, plan.limit)}</p>
        </div>
        <div className="flex items-center gap-2">
          {session.role === "owner" && (
            <Button asChild variant="outline">
              <Link href="/alunos/cadastros-publicos">
                <Globe aria-hidden />
                <span className="hidden sm:inline">{t.publicSignups}</span>
                <span className="sr-only sm:hidden">{t.publicSignups}</span>
                {pendingSignups > 0 && (
                  <span className="tabular rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                    {pendingSignups}
                    <span className="sr-only"> pendentes</span>
                  </span>
                )}
              </Link>
            </Button>
          )}
          <Button asChild>
            <Link href={newHref} scroll={false}>
              <UserPlus aria-hidden />
              <span className="hidden sm:inline">{t.add}</span>
              <span className="sr-only sm:hidden">{t.add}</span>
            </Link>
          </Button>
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

      {dialog && formOptions && (
        <StudentFormDialog
          key={dialog.id ?? "novo"}
          mode={dialog.mode}
          student={editing}
          options={formOptions}
          role={session.role === "owner" ? "owner" : "trainer"}
          currentUserId={session.userId}
          organizationId={session.organizationId}
          planLimit={plan.limit}
          closeHref={listHref}
        />
      )}
    </div>
  );
}
