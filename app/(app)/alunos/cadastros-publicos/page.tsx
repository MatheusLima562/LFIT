import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { ChevronLeft, Lock } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { PendingSignups } from "@/features/signup/components/PendingSignups";
import { SignupLinkCard } from "@/features/signup/components/SignupLinkCard";
import { getSignupLinkAdmin, listPendingSignups } from "@/features/signup/queries";
import { getStudentFormOptions } from "@/features/students/queries";
import { messages } from "@/messages/pt-BR";
import { EmptyState } from "@/components/ui/EmptyState";

const a = messages.signup.admin;

export const metadata: Metadata = { title: a.title };

async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

export default async function PublicSignupsPage() {
  const session = await requireStaff();

  const header = (
    <header>
      <Link href="/alunos" className="mb-2 inline-flex items-center gap-1 rounded text-xs text-ink-3 hover:text-ink">
        <ChevronLeft aria-hidden className="size-3.5" />
        {messages.students.title}
      </Link>
      <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-[22px]">{a.title}</h1>
      <p className="mt-0.5 text-[13px] text-ink-2">{a.subtitle}</p>
    </header>
  );

  if (session.role !== "owner") {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        {header}
        <EmptyState icon={<Lock />} message={a.ownerOnly} className="min-h-48 bg-surface" />
      </div>
    );
  }

  const [link, signups, options, url] = await Promise.all([
    getSignupLinkAdmin(),
    listPendingSignups(),
    getStudentFormOptions(),
    siteUrl(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      {header}
      {link && <SignupLinkCard siteUrl={url} token={link.token} isActive={link.isActive} config={link.config} />}
      <section aria-labelledby="pending-title" className="flex flex-col gap-3">
        <div>
          <h2 id="pending-title" className="text-[15px] font-semibold text-ink">
            {a.pendingTitle} <span className="tabular text-ink-3">({signups.length})</span>
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-3">{a.pendingHint}</p>
        </div>
        <PendingSignups signups={signups} trainers={options.trainers} groups={options.groups} />
      </section>
    </div>
  );
}
