import type { Metadata } from "next";
import { SetPasswordPage } from "@/features/auth/components/SetPasswordPage";
import { messages } from "@/messages/pt-BR";

export const metadata: Metadata = { title: messages.auth.newPassword.inviteTitle };

export default function InvitePage() {
  return <SetPasswordPage mode="invite" />;
}
