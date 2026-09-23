import { requireStaff } from "@/lib/auth/session";
import { getOrganizationPlanUsage } from "@/features/organizations/queries";
import { messages } from "@/messages/pt-BR";
import { AppShell } from "@/components/layout/AppShell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireStaff();
  const plan = await getOrganizationPlanUsage();

  return (
    <AppShell
      user={{
        fullName: session.fullName,
        roleLabel: messages.roles[session.role],
        organizationName: session.organizationName,
      }}
      plan={plan}
    >
      {children}
    </AppShell>
  );
}
