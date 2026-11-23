import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AccountManager } from "@/features/platform/components/AccountManager";
import { PaymentReviewBadge } from "@/features/platform/components/PaymentReviewBadge";
import { needsPaymentReview } from "@/features/platform/platform";
import { getPlatformAccount } from "@/features/platform/queries";
import { isoToBR, todayISO } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { messages } from "@/messages/pt-BR";

const t = messages.platform;

export default async function PlatformAccountPage({ params }: PageProps<"/plataforma/contas/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await getPlatformAccount(id);
  if (!data) notFound();
  const { account, detail } = data;
  return (
    <div className="flex flex-col gap-5">
      <header>
        <Link href="/plataforma" className="mb-2 inline-flex items-center gap-1 rounded text-xs text-ink-3 hover:text-ink">
          <ChevronLeft aria-hidden className="size-3.5" />
          {t.detail.back}
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{account.name}</h1>
        <p className="mt-0.5 text-[13px] text-ink-2">
          {account.ownerName} · {account.ownerEmail} · {t.columns.createdAt} {formatDate(account.createdAt)}
          {account.paidUntil ? ` · ${t.detail.paidUntil(formatDate(account.paidUntil))}` : ""}
        </p>
        {needsPaymentReview(account, todayISO()) && (
          <div className="mt-2 flex flex-col gap-1">
            <PaymentReviewBadge paidUntil={account.paidUntil!} />
            <p className="text-xs text-ink-2">{t.paymentReviewHint(isoToBR(account.paidUntil!))}</p>
          </div>
        )}
      </header>
      <AccountManager account={account} detail={detail} />
    </div>
  );
}
