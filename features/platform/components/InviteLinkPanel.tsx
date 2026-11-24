"use client";

import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { messages } from "@/messages/pt-BR";
import { whatsappUrl } from "../platform";

const t = messages.platform.invite;

/** Link de definir senha do personal: copiar ou abrir o WhatsApp com a mensagem pronta. Nada é enviado por e-mail. */
export function InviteLinkPanel({ url, name }: { url: string; name: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t.copied);
    } catch {
      toast.error(messages.platform.failed);
    }
  };
  return (
    <section aria-label={t.label} className="flex flex-col gap-2 rounded-xl bg-canvas p-3 ring-1 ring-line">
      <p className="text-sm font-medium text-ink">{t.label}</p>
      <input readOnly value={url} aria-label={t.label} onFocus={(e) => e.currentTarget.select()} className="h-10 w-full min-w-0 rounded-lg border border-line bg-surface px-2 text-sm text-ink" />
      <p className="text-xs text-ink-3">{t.hint}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          <Copy aria-hidden />
          {t.copy}
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={whatsappUrl(t.message(name, url))} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden />
            {t.whatsapp}
          </a>
        </Button>
      </div>
    </section>
  );
}
