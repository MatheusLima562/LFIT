import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { InviteManager } from "@/features/students/components/InviteManager";
import { getInviteQuota, listInvitableStudents } from "@/features/students/invite-queries";
import { defaultInviteTemplate } from "@/features/students/invites";
import { getMyBranding } from "@/features/settings/queries";
import { requireStaff } from "@/lib/auth/session";
import { messages } from "@/messages/pt-BR";

const t = messages.invites;

export const metadata: Metadata = { title: t.title };

/** Convidar alunos sem login (inclusive importados): links de uso único de 7 dias, por WhatsApp ou copiados. */
export default async function InvitesPage({ searchParams }: PageProps<"/alunos/convites">) {
  const session = await requireStaff();
  const sp = await searchParams;
  const preselected = typeof sp.aluno === "string" && /^[0-9a-f-]{36}$/.test(sp.aluno) ? sp.aluno : null;
  const [students, quota, branding] = await Promise.all([listInvitableStudents(), getInviteQuota(), getMyBranding()]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <header>
        <Link href="/alunos" className="mb-2 inline-flex items-center gap-1 rounded text-xs text-ink-3 hover:text-ink">
          <ChevronLeft aria-hidden className="size-3.5" />
          {messages.students.title}
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-[22px]">{t.title}</h1>
        <p className="mt-0.5 max-w-2xl text-[13px] text-ink-2">{t.subtitle}</p>
      </header>
      <InviteManager
        students={students}
        preselected={preselected && students.some((s) => s.id === preselected) ? preselected : null}
        template={defaultInviteTemplate(session.firstName, branding?.name || session.organizationName)}
        quota={quota}
      />
    </div>
  );
}
