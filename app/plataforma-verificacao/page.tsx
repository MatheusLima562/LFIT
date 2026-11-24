import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";
import { PlatformMfa } from "@/features/platform/components/PlatformMfa";
import { createClient } from "@/lib/db/server";
import { messages } from "@/messages/pt-BR";

const t = messages.platform;

export const metadata: Metadata = { title: t.mfa.title, robots: { index: false, follow: false } };

/**
 * Segundo fator do painel da plataforma (fora do layout de /plataforma, que exige aal2). Fora da lista → 404; já em aal2
 * → painel. O banco recusa toda RPC da plataforma sem aal2, então esta tela é só o caminho para chegar lá.
 */
export default async function PlatformVerificationPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/entrar?next=/plataforma");
  const { data: access } = await supabase.rpc("platform_access");
  if (access === "ok") redirect("/plataforma");
  if (access !== "mfa_required") notFound();

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp.find((f) => f.status === "verified") ?? null;
  const stale = (factors?.all ?? []).filter((f) => f.factor_type === "totp" && f.status !== "verified").map((f) => f.id);

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4 py-8">
      <div className="flex w-full max-w-md flex-col gap-3">
        <PlatformMfa factorId={verified?.id ?? null} staleFactorIds={stale} />
        <form action={signOut} className="self-end">
          <Button type="submit" variant="ghost" size="sm">
            <LogOut aria-hidden />
            {t.signOut}
          </Button>
        </form>
      </div>
    </div>
  );
}
