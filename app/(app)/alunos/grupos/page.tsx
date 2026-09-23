import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { GroupsManager } from "@/features/groups/components/GroupsManager";
import { listGroups } from "@/features/groups/queries";
import { messages } from "@/messages/pt-BR";

const t = messages.groups;

export const metadata: Metadata = { title: t.title };

export default async function GroupsPage() {
  const session = await requireStaff();
  const groups = await listGroups();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <header>
        <Link href="/alunos" className="mb-2 inline-flex items-center gap-1 rounded text-xs text-ink-3 hover:text-ink">
          <ChevronLeft aria-hidden className="size-3.5" />
          {messages.students.title}
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-[22px]">{t.title}</h1>
        <p className="mt-0.5 max-w-2xl text-[13px] text-ink-2">{t.subtitle}</p>
      </header>
      <GroupsManager groups={groups} canDelete={session.role === "owner"} />
    </div>
  );
}
