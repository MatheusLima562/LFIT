import { currentUser } from "@/data/dashboard";
import { getPlanUsage } from "@/lib/dashboard";
import { AppShell } from "@/components/layout/AppShell";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell user={currentUser} plan={getPlanUsage()}>
      {children}
    </AppShell>
  );
}
