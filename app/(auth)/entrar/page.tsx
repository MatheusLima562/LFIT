import type { Metadata } from "next";
import { AuthHeading } from "@/features/auth/components/AuthHeading";
import { AuthMessage } from "@/features/auth/components/AuthMessage";
import { SignInForm } from "@/features/auth/components/SignInForm";
import { safeNext } from "@/features/auth/schemas";
import { messages } from "@/messages/pt-BR";

const t = messages.auth;

export const metadata: Metadata = { title: t.signIn.title };

const notices: Record<string, string> = {
  link: t.errors.linkInvalid,
  perfil: t.errors.noProfile,
};

export default async function SignInPage({ searchParams }: PageProps<"/entrar">) {
  const { next, erro } = await searchParams;
  const notice = typeof erro === "string" ? notices[erro] : undefined;

  return (
    <>
      <AuthHeading title={t.signIn.title} subtitle={t.signIn.subtitle} />
      {notice && (
        <div className="mb-5">
          <AuthMessage tone="error">{notice}</AuthMessage>
        </div>
      )}
      <SignInForm next={safeNext(next)} />
    </>
  );
}
