import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listPlatformAccounts } from "@/features/platform/queries";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";

const t = messages.platform;

const TONE = {
  active: "bg-success-soft text-success-ink ring-success-line",
  past_due: "bg-warning-soft text-warning-ink ring-warning-line",
  suspended: "bg-danger-soft text-danger-ink ring-danger-line",
  canceled: "bg-canvas text-ink-3 ring-line",
} as const;

/** Contas dos personais. Só dados da conta: nada de aluno, treino, chat, feed, NPS ou saúde. */
export default async function PlatformPage() {
  const accounts = await listPlatformAccounts();
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">{t.accounts}</h1>
          <p className="mt-0.5 text-[13px] text-ink-2">{t.subtitle}</p>
        </div>
        <Button asChild>
          <Link href="/plataforma/nova">
            <Plus aria-hidden />
            {t.newAccount}
          </Link>
        </Button>
      </header>
      {accounts.length === 0 ? (
        <p className="rounded-2xl bg-surface p-5 text-sm text-ink-2 ring-1 ring-line">{t.empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-surface ring-1 ring-line">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-line text-xs text-ink-3">
              <tr>
                {Object.values(t.columns).map((c) => (
                  <th key={c} scope="col" className="px-4 py-2.5 font-medium">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3">
                    <Link href={`/plataforma/contas/${a.id}`} className="link font-medium">{a.name}</Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="block text-ink">{a.ownerName}</span>
                    <span className="block text-xs text-ink-3">{a.ownerEmail}</span>
                  </td>
                  <td className="px-4 py-3">{t.plans[a.plan]}</td>
                  <td className="px-4 py-3 tabular-nums">{t.seats(a.seatsUsed, a.studentLimit)}</td>
                  <td className="px-4 py-3">{formatDate(a.createdAt)}</td>
                  <td className="px-4 py-3">{a.lastAccessAt ? formatDate(a.lastAccessAt) : a.ownerPending ? t.pendingOwner : t.never}</td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold ring-1", TONE[a.status])}>{t.status[a.status]}</span>
                    <span className="mt-1 block text-xs text-ink-3">{t.state[a.accessState]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
