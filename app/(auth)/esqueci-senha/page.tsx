import type { Metadata } from "next";
import { AuthHeading } from "@/features/auth/components/AuthHeading";
import { ForgotPasswordForm } from "@/features/auth/components/ForgotPasswordForm";
import { messages } from "@/messages/pt-BR";

const t = messages.auth.forgot;

export const metadata: Metadata = { title: t.title };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading title={t.title} subtitle={t.subtitle} />
      <ForgotPasswordForm />
    </>
  );
}
