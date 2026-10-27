import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AuthHeading } from "@/features/auth/components/AuthHeading";
import { SignUpForm } from "@/features/auth/components/SignUpForm";
import { messages } from "@/messages/pt-BR";

const t = messages.auth.signUp;

export const metadata: Metadata = { title: t.title };

/** Desligada por padrão: trainers entram por convite do owner (ALLOW_PUBLIC_SIGNUP). */
export default async function SignUpPage() {
  await connection(); // lê a flag em tempo de execução, não no build
  if (process.env.ALLOW_PUBLIC_SIGNUP !== "true") notFound();
  return (
    <>
      <AuthHeading title={t.title} subtitle={t.subtitle} />
      <SignUpForm />
    </>
  );
}
