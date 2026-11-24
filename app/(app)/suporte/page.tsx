import type { Metadata } from "next";
import { Mail, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { whatsappUrl } from "@/features/platform/platform";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { messages } from "@/messages/pt-BR";

const t = messages.suporte;

export const metadata: Metadata = { title: t.title };

/** Suporte: WhatsApp/e-mail da plataforma (configurados em `private.account_rules`, por SQL). */
export default async function SupportPage() {
  await requireStaff();
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_platform_support");
  const c = (data ?? {}) as { whatsapp?: string | null; email?: string | null };
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight text-ink">{t.title}</h1>
      <p className="text-sm text-ink-2">{t.subtitle}</p>
      {!c.whatsapp && !c.email ? (
        <p className="text-sm text-ink-3">{messages.subscription.noContact}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {c.whatsapp && (
            <Button asChild>
              <a href={whatsappUrl(t.whatsappText, c.whatsapp)} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden />
                {messages.subscription.contactWhatsapp}
              </a>
            </Button>
          )}
          {c.email && (
            <Button asChild variant="outline">
              <a href={`mailto:${c.email}`}>
                <Mail aria-hidden />
                {messages.subscription.contactEmail}
              </a>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
