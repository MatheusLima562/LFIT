import Link from "next/link";
import { createClient } from "@/lib/db/server";
import { buttonVariants } from "@/components/ui/button";
import { messages } from "@/messages/pt-BR";
import { AuthHeading } from "./AuthHeading";
import { AuthMessage } from "./AuthMessage";
import { NewPasswordForm } from "./NewPasswordForm";

const t = messages.auth.newPassword;

/** Tela de definir senha, usada por /convite e /redefinir-senha (exige sessão do link). */
export async function SetPasswordPage({ mode }: { mode: "invite" | "reset" }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const hasSession = Boolean(data?.claims?.sub);

  return (
    <>
      <AuthHeading
        title={mode === "invite" ? t.inviteTitle : t.resetTitle}
        subtitle={mode === "invite" ? t.inviteSubtitle : t.resetSubtitle}
      />
      {hasSession ? (
        <NewPasswordForm />
      ) : (
        <div className="flex flex-col gap-5">
          <AuthMessage tone="error">{t.expired}</AuthMessage>
          <Link href="/esqueci-senha" className={buttonVariants({ size: "lg", className: "w-full" })}>
            {messages.auth.forgot.submit}
          </Link>
        </div>
      )}
    </>
  );
}
