"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { messages } from "@/messages/pt-BR";
import { closedAllows, daysLeft, isReadOnly, type MySubscription } from "../subscription";
import { RegularizePanel } from "./RegularizePanel";

const t = messages.subscription;

/**
 * Banner da assinatura acima do conteúdo do painel: tolerância (em atraso) ou somente leitura. Conta encerrada: o
 * personal só vê Configurações/Regularizar/Suporte; o professor da equipe vê só o aviso.
 */
export function SubscriptionNotice({ sub, role, children }: { sub: MySubscription; role: "owner" | "trainer"; children: ReactNode }) {
  const pathname = usePathname();
  const [now] = useState(() => Date.now());

  if (sub.state === "closed" && !closedAllows(pathname, role)) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-10">
        <h1 className="text-xl font-semibold text-ink">{t.closedTitle}</h1>
        <p className="text-sm text-ink-2">{role === "owner" ? t.closedOwner : t.closedTrainer}</p>
        {role === "owner" && (
          <>
            <Link href="/configuracoes" className="link self-start text-sm">{messages.settings.title}</Link>
            <RegularizePanel sub={sub} />
          </>
        )}
      </div>
    );
  }

  const banner =
    sub.state === "grace" ? (
      <p role="status" className="flex flex-wrap items-center gap-2 border-b border-warning-line bg-warning-soft px-4 py-2 text-[13px] text-warning-ink">
        <TriangleAlert aria-hidden className="size-4 shrink-0" />
        <span className="flex-1">{t.graceBanner(daysLeft(sub.graceEndsAt, now))}</span>
        <Link href="/regularizar" className="font-semibold underline">{t.regularize}</Link>
      </p>
    ) : isReadOnly(sub.state) ? (
      <p role="status" className="flex flex-wrap items-center gap-2 border-b border-danger-line bg-danger-soft px-4 py-2 text-[13px] text-danger-ink">
        <Lock aria-hidden className="size-4 shrink-0" />
        <span className="flex-1">{t.readOnlyBanner}</span>
        <Link href="/regularizar" className="font-semibold underline">{t.regularize}</Link>
      </p>
    ) : null;

  return (
    <>
      {banner}
      {children}
    </>
  );
}
