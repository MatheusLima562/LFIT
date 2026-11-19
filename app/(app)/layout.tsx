import { requireStaff } from "@/lib/auth/session";
import { getOrganizationPlanUsage } from "@/features/organizations/queries";
import { getStaffUnread } from "@/features/chat/queries";
import { SubscriptionNotice } from "@/features/subscription/components/SubscriptionNotice";
import { getMySubscription } from "@/features/subscription/queries";
import { messages } from "@/messages/pt-BR";
import { AppShell } from "@/components/layout/AppShell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireStaff();
  const [plan, chatUnread, sub] = await Promise.all([getOrganizationPlanUsage(), getStaffUnread(), getMySubscription()]);

  return (
    <AppShell
      user={{
        fullName: session.fullName,
        roleLabel: messages.roles[session.role],
        organizationName: session.organizationName,
      }}
      plan={plan}
      chatUnread={chatUnread}
    >
      {/* Assinatura: banner (tolerância/somente leitura) e, com a conta encerrada, só Configurações para o personal. */}
      <SubscriptionNotice sub={sub} role={session.role === "owner" ? "owner" : "trainer"}>
        {children}
      </SubscriptionNotice>
    </AppShell>
  );
}
