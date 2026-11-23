"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BRAND } from "@/features/brand/config";
import { createClient } from "@/lib/db/client";
import { messages } from "@/messages/pt-BR";

const t = messages.platform.mfa;

/**
 * Segundo fator do painel da plataforma (TOTP do Supabase Auth). Com fator verificado: pede o código. Sem: cadastra
 * (QR code + chave) e confirma com o primeiro código. Ao verificar, a sessão vira aal2 e o painel abre.
 * Fatores não verificados que sobraram de uma tentativa anterior são removidos antes de gerar outro QR code.
 */
export function PlatformMfa({ factorId, staleFactorIds }: { factorId: string | null; staleFactorIds: string[] }) {
  const id = useId();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [enrolled, setEnrolled] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const activeFactor = factorId ?? enrolled?.id ?? null;

  const enroll = () =>
    start(async () => {
      setError(null);
      const supabase = createClient();
      for (const stale of staleFactorIds) await supabase.auth.mfa.unenroll({ factorId: stale });
      const { data, error: e } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: `${BRAND.name} plataforma`,
        friendlyName: `${BRAND.name} plataforma ${Date.now()}`,
      });
      if (e || !data) return void setError(t.failed);
      setEnrolled({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    });

  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFactor) return;
    start(async () => {
      setError(null);
      const { error: err } = await createClient().auth.mfa.challengeAndVerify({ factorId: activeFactor, code: code.trim() });
      if (err) return void setError(t.invalid);
      router.replace("/plataforma");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-surface p-5 ring-1 ring-line">
      <h1 className="text-lg font-semibold text-ink">{t.title}</h1>
      {!activeFactor ? (
        <>
          <p className="text-sm text-ink-2">{t.enrollIntro}</p>
          <Button type="button" onClick={enroll} disabled={pending} className="self-start">{t.start}</Button>
        </>
      ) : (
        <>
          {enrolled ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink-2">{t.scan}</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- data URI (SVG) gerado pelo Supabase Auth */}
              <img src={enrolled.qr} alt={t.qrAlt} width={180} height={180} className="rounded-lg bg-white p-2 ring-1 ring-line" />
              <p className="text-xs text-ink-3">{t.secretLabel}</p>
              <code className="break-all rounded-lg bg-canvas px-3 py-2 text-xs text-ink" data-testid="mfa-secret">{enrolled.secret}</code>
            </div>
          ) : (
            <p className="text-sm text-ink-2">{t.verifyIntro}</p>
          )}
          <form onSubmit={verify} className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-code`} className="text-sm font-medium text-ink">{t.codeLabel}</label>
            <div className="flex gap-2">
              <Input
                id={`${id}-code`}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="max-w-40 tabular-nums"
              />
              <Button type="submit" disabled={pending || code.length !== 6}>{t.confirm}</Button>
            </div>
          </form>
        </>
      )}
      {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
    </div>
  );
}
