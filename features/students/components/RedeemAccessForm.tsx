"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { AuthMessage } from "@/features/auth/components/AuthMessage";
import { messages } from "@/messages/pt-BR";
import { redeemAccessLink } from "../access-actions";

export function RedeemAccessForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await redeemAccessLink(token);
          if ("error" in result) setError(result.error);
          else window.location.assign(result.url);
        });
      }}
      className="flex flex-col gap-5"
    >
      {error && <AuthMessage tone="error">{error}</AuthMessage>}
      <Button type="submit" size="lg" disabled={pending || Boolean(error)} className="w-full">
        {pending ? messages.access.continuing : messages.access.continue}
      </Button>
    </form>
  );
}
