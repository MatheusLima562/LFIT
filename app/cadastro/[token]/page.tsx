import type { Metadata } from "next";
import { LinkIcon } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { PublicSignupForm } from "@/features/signup/components/PublicSignupForm";
import { getPublicSignupForm } from "@/features/signup/queries";
import { turnstileReady, turnstileSiteKey } from "@/features/signup/turnstile";
import { messages } from "@/messages/pt-BR";

const p = messages.signup.public;

export const metadata: Metadata = { title: "Cadastro de aluno", robots: { index: false, follow: false } };

/** Formulário público de cadastro. Nada da organização além do nome é exposto. */
export default async function PublicSignupPage({ params }: PageProps<"/cadastro/[token]">) {
  const { token } = await params;
  // Sem proteção anti-robô configurada, o formulário não é oferecido (fail-closed).
  const siteKey = turnstileReady() ? turnstileSiteKey() : null;
  const form = siteKey ? await getPublicSignupForm(token) : null;

  return (
    <div className="min-h-dvh bg-canvas px-4 py-6 sm:py-10">
      <div className="mx-auto flex max-w-xl items-center justify-between pb-6">
        <Logo />
        <ThemeToggle />
      </div>
      <main className="relative mx-auto max-w-xl rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-8">
        {form ? (
          <>
            <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{p.title(form.organizationName)}</h1>
            <p className="mt-1.5 mb-6 text-sm text-ink-2">{p.subtitle}</p>
            <PublicSignupForm token={token} config={form.config} siteKey={siteKey!} />
          </>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <span aria-hidden className="grid size-11 place-items-center rounded-full bg-canvas text-ink-3 ring-1 ring-line">
              <LinkIcon className="size-5" />
            </span>
            <h1 className="text-xl font-semibold tracking-tight text-ink">{p.unavailableTitle}</h1>
            <p className="text-sm text-ink-2">{siteKey ? p.unavailableText : p.temporarilyUnavailable}</p>
          </div>
        )}
      </main>
    </div>
  );
}
