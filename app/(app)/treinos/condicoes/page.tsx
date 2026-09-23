import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth/session";
import { ConditionsManager } from "@/features/conditions/components/ConditionsManager";
import { listConditions } from "@/features/conditions/queries";
import { messages } from "@/messages/pt-BR";

const t = messages.conditions;

export const metadata: Metadata = { title: t.title };

export default async function ConditionsPage() {
  const session = await requireStaff();
  const conditions = await listConditions();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-[22px]">{t.title}</h1>
        <p className="mt-0.5 max-w-2xl text-[13px] text-ink-2">{t.subtitle}</p>
      </header>
      <ConditionsManager conditions={conditions} isOwner={session.role === "owner"} />
    </div>
  );
}
