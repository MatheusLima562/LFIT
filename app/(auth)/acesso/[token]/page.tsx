import type { Metadata } from "next";
import { AuthHeading } from "@/features/auth/components/AuthHeading";
import { RedeemAccessForm } from "@/features/students/components/RedeemAccessForm";
import { messages } from "@/messages/pt-BR";

const t = messages.access;

export const metadata: Metadata = { title: t.title, robots: { index: false, follow: false } };

/** Só exibe o botão; o token é consumido no POST (ver redeemAccessLink). */
export default async function AccessLinkPage({ params }: PageProps<"/acesso/[token]">) {
  const { token } = await params;
  return (
    <>
      <AuthHeading title={t.title} subtitle={t.subtitle} />
      <RedeemAccessForm token={token} />
    </>
  );
}
