import { AlertTriangle } from "lucide-react";
import { isoToBR } from "@/lib/dates";
import { messages } from "@/messages/pt-BR";

const t = messages.platform;

/** Selo "Pagamento vencido, revisar" (pago até no passado e situação ainda "Em dia"). Só aviso; nada muda sozinho. */
export function PaymentReviewBadge({ paidUntil }: { paidUntil: string }) {
  return (
    <span
      title={t.paymentReviewHint(isoToBR(paidUntil))}
      className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning-ink ring-1 ring-warning-line"
    >
      <AlertTriangle aria-hidden className="size-3" />
      {t.paymentReview}
    </span>
  );
}
