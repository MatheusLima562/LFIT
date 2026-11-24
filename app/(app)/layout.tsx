import { requireStaff } from "@/lib/auth/session";
import { getOrganizationPlanUsage } from "@/features/organizations/queries";
import { getStaffUnread } from "@/features/chat/queries";
import { SubscriptionNotice } from "@/features/subscription/components/SubscriptionNotice";
import { getMySubscription } from "@/features/subscription/queries";
import { messages } from "@/messages/pt-BR";
import { AppShell } from "@/components/layout/AppShell";
import { getCoachStatus } from "@/features/coach-ai/queries";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireStaff();
  // IA do personal (desligada por padrão): com ela ligada e plano Pro/Gold, o celular ganha a barra com o microfone.
  const [plan, chatUnread, sub, coach] = await Promise.all([getOrganizationPlanUsage(), getStaffUnread(), getMySubscription(), getCoachStatus()]);

  return (
    <AppShell
      user={{
        fullName: session.fullName,
        roleLabel: messages.roles[session.role],
        organizationName: session.organizationName,
      }}
      plan={plan}
      chatUnread={chatUnread}
      coach={coach}
    >
      {/* Assinatura: banner (tolerância/somente leitura) e, com a conta encerrada, só Configurações para o personal. */}
      <SubscriptionNotice sub={sub} role={session.role === "owner" ? "owner" : "trainer"}>
        {children}
      </SubscriptionNotice>
    </AppShell>
  );
}
