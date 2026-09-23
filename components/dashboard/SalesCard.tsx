import { ArrowLeftRight, Clock3, Landmark, Wallet, type LucideIcon } from "lucide-react";
import type { SalesSummary } from "@/types/dashboard";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { messages } from "@/messages/pt-BR";
import { Card, CardHeader, CardIcon, CardLink } from "@/components/ui/Card";
import { InfoHint } from "@/components/ui/InfoHint";

interface SalesStat {
  key: keyof SalesSummary;
  label: string;
  hint: string;
  icon: LucideIcon;
  iconClass: string;
}

const stats: SalesStat[] = [
  {
    key: "receivable",
    label: "A receber",
    hint: "Pagamentos aprovados aguardando liberação.",
    icon: Clock3,
    iconClass: "bg-amber-50 text-amber-700",
  },
  {
    key: "available",
    label: "Disponível",
    hint: "Saldo liberado para saque.",
    icon: Wallet,
    iconClass: "bg-emerald-50 text-emerald-700",
  },
  {
    key: "transactions",
    label: "Transações",
    hint: "Volume total transacionado nos últimos 30 dias.",
    icon: ArrowLeftRight,
    iconClass: "bg-violet-50 text-violet-700",
  },
];

export function SalesCard({ sales }: { sales: SalesSummary }) {
  return (
    <Card labelledBy="card-sales" className="h-full">
      <CardHeader
        id="card-sales"
        title="Vendas"
        icon={<CardIcon><Landmark /></CardIcon>}
        action={<CardLink href="/vendas/extrato">Ver extrato</CardLink>}
      />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <dl className="grid flex-1 grid-cols-1 overflow-hidden rounded-xl border border-line sm:grid-cols-3 sm:divide-x sm:divide-line max-sm:divide-y max-sm:divide-line">
          {stats.map(({ key, label, hint, icon: Icon, iconClass }) => (
            <div key={key} className="flex items-center gap-3 px-4 py-3.5">
              <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-xl ${iconClass}`}>
                <Icon className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <dt className="flex items-center gap-0.5 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
                  {label}
                  <InfoHint content={hint} />
                </dt>
                <dd className="tabular text-lg leading-tight font-semibold tracking-tight text-ink">
                  {formatCurrency(sales[key])}
                </dd>
              </div>
            </div>
          ))}
        </dl>
        <div className="flex shrink-0 flex-row gap-2 lg:w-44 lg:flex-col lg:justify-center">
          <Button
            size="lg"
            disabled={sales.available === 0}
            title={sales.available === 0 ? "Sem saldo disponível para saque" : undefined}
            className="flex-1 lg:flex-none"
          >
            Solicitar saque
          </Button>
          <Button variant="outline" size="lg" disabled title={messages.app.soonHint} className="flex-1 lg:flex-none">
            Nova cobrança
          </Button>
        </div>
      </div>
    </Card>
  );
}
