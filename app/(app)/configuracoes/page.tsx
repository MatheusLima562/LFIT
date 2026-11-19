import type { Metadata } from "next";
import { BusinessForm, ExportPanel, PasswordForm, ProfileForm } from "@/features/settings/components/SettingsForms";
import { getMyBranding, getMyStaffProfile } from "@/features/settings/queries";
import { getOrganizationPlanUsage } from "@/features/organizations/queries";
import { getMySubscription } from "@/features/subscription/queries";
import { requireStaff } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { messages } from "@/messages/pt-BR";

const t = messages.settings;

export const metadata: Metadata = { title: t.title };

/** Configurações: perfil (todos), negócio e exportação (personal), senha, plano e assinatura (só leitura). */
export default async function SettingsPage() {
  const session = await requireStaff();
  const isOwner = session.role === "owner";
  const [profile, branding, plan, sub] = await Promise.all([
    getMyStaffProfile(session.userId),
    getMyBranding(),
    getOrganizationPlanUsage(),
    getMySubscription(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-[22px]">{t.title}</h1>
        <p className="mt-0.5 text-[13px] text-ink-2">{t.subtitle}</p>
      </header>

      <ProfileForm orgId={session.organizationId} userId={session.userId} initial={profile} />

      {isOwner && branding ? (
        <BusinessForm orgId={session.organizationId} initial={branding} />
      ) : (
        <p className="text-xs text-ink-3">{t.business.ownerOnly}</p>
      )}

      <PasswordForm />

      <section aria-labelledby="plan-title" className="flex flex-col gap-3 rounded-2xl bg-surface p-5 ring-1 ring-line">
        <h2 id="plan-title" className="text-[15px] font-semibold text-ink">{t.plan.title}</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-ink-3">{t.plan.plan}</dt><dd className="text-ink">{plan.planName}</dd></div>
          <div><dt className="text-xs text-ink-3">{t.plan.seats}</dt><dd className="text-ink">{t.plan.seatsValue(plan.used, plan.limit)}</dd></div>
          <div><dt className="text-xs text-ink-3">{t.plan.status}</dt><dd className="text-ink">{messages.platform.status[sub.status]}</dd></div>
          {sub.paidUntil && <div><dt className="text-xs text-ink-3">{t.plan.paidUntil}</dt><dd className="text-ink">{formatDate(sub.paidUntil)}</dd></div>}
        </dl>
        <p className="text-xs text-ink-3">{t.plan.readOnlyHint}</p>
      </section>

      {isOwner ? <ExportPanel /> : <p className="text-xs text-ink-3">{t.export.ownerOnly}</p>}
    </div>
  );
}
