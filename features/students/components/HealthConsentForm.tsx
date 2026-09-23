"use client";

import { useState, useTransition } from "react";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { AuthMessage } from "@/features/auth/components/AuthMessage";
import { respondHealthConsent } from "../consent-actions";

const t = messages.consent;

export function HealthConsentForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const respond = (accept: boolean) =>
    startTransition(async () => {
      const result = await respondHealthConsent(accept);
      if (!result.ok) return setError(result.error);
      // Navegação completa (documento): o Route Handler /acesso/concluir encerra a sessão via cookies.
      const target = new URL(`/acesso/concluir?consentimento=${accept ? "aceito" : "recusado"}`, window.location.origin);
      window.location.assign(target.href);
    });

  return (
    <div className="flex flex-col gap-3">
      {error && <AuthMessage tone="error">{error}</AuthMessage>}
      <Button size="lg" disabled={pending} onClick={() => respond(true)} className="w-full">
        {pending ? t.saving : t.accept}
      </Button>
      <Button size="lg" variant="outline" disabled={pending} onClick={() => respond(false)} className="w-full">
        {t.decline}
      </Button>
    </div>
  );
}
