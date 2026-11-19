import { Mail, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { whatsappUrl } from "@/features/platform/platform";
import { messages } from "@/messages/pt-BR";
import type { MySubscription } from "../subscription";

const t = messages.subscription;

/** Contato da plataforma (WhatsApp/e-mail de `private.account_rules`). Sem contato configurado: aviso. */
export function RegularizePanel({ sub }: { sub: Pick<MySubscription, "supportWhatsapp" | "supportEmail"> }) {
  if (!sub.supportWhatsapp && !sub.supportEmail) return <p className="text-sm text-ink-3">{t.noContact}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {sub.supportWhatsapp && (
        <Button asChild>
          <a href={whatsappUrl(t.whatsappText, sub.supportWhatsapp)} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden />
            {t.contactWhatsapp}
          </a>
        </Button>
      )}
      {sub.supportEmail && (
        <Button asChild variant="outline">
          <a href={`mailto:${sub.supportEmail}`}>
            <Mail aria-hidden />
            {t.contactEmail}
          </a>
        </Button>
      )}
    </div>
  );
}
