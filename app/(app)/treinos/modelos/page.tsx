import type { Metadata } from "next";
import Link from "next/link";
import { LayoutTemplate, Plus } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { PlanCard } from "@/features/plans/components/PlanCard";
import { listStudentOptions, listTemplates } from "@/features/plans/queries";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";

const t = messages.plans.templates;

export const metadata: Metadata = { title: t.title };

export default async function TemplatesPage({ searchParams }: PageProps<"/treinos/modelos">) {
  const session = await requireStaff();
  const showArchived = (await searchParams).arquivados === "1";
  const [templates, students] = await Promise.all([listTemplates(session, showArchived), listStudentOptions()]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-[22px]">{t.title}</h1>
          <p className="mt-0.5 max-w-2xl text-[13px] text-ink-2">{t.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost">
            <Link href={showArchived ? "/treinos/modelos" : "/treinos/modelos?arquivados=1"}>{showArchived ? t.hideArchived : t.showArchived}</Link>
          </Button>
          <Button asChild>
            <Link href="/treinos/novo">
              <Plus aria-hidden />
              {t.new}
            </Link>
          </Button>
        </div>
      </header>
      {templates.length === 0 ? (
        <EmptyState icon={<LayoutTemplate />} message={t.empty} className="min-h-48 bg-surface" />
      ) : (
        <ul className="flex flex-col gap-3">
          {templates.map((tpl) => (
            <PlanCard key={tpl.id} plan={tpl} isTemplate authorName={tpl.authorName} students={tpl.status === "archived" ? undefined : students} />
          ))}
        </ul>
      )}
    </div>
  );
}
