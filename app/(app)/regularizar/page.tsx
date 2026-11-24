import type { Metadata } from "next";
import { RegularizePanel } from "@/features/subscription/components/RegularizePanel";
import { getMySubscription } from "@/features/subscription/queries";
import { requireStaff } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { messages } from "@/messages/pt-BR";

const t = messages.subscription;

export const metadata: Metadata = { title: t.regularizeTitle };

/** "Regularizar assinatura": situação e contato da plataforma. Nada é apagado enquanto a conta está limitada. */
export default async function RegularizePage() {
  await requireStaff();
  const sub = await getMySubscription();
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight text-ink">{t.regularizeTitle}</h1>
      <p className="text-sm text-ink-2">
        {messages.platform.status[sub.status]} · {messages.platform.state[sub.state]}
        {sub.paidUntil ? ` · ${messages.platform.detail.paidUntil(formatDate(sub.paidUntil))}` : ""}
      </p>
      <p className="text-sm text-ink-2">{t.regularizeText}</p>
      <RegularizePanel sub={sub} />
    </div>
  );
}
