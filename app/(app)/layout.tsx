import { requireStaff } from "@/lib/auth/session";
import { getOrganizationPlanUsage } from "@/features/organizations/queries";
import { getStaffUnread } from "@/features/chat/queries";
import { messages } from "@/messages/pt-BR";
import { AppShell } from "@/components/layout/AppShell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireStaff();
  const [plan, chatUnread] = await Promise.all([getOrganizationPlanUsage(), getStaffUnread()]);

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
      {children}
    </AppShell>
  );
}
