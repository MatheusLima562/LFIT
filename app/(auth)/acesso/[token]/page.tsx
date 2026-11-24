import type { Metadata } from "next";
import { AuthHeading } from "@/features/auth/components/AuthHeading";
import { getAccessLinkBranding } from "@/features/settings/queries";
import { RedeemAccessForm } from "@/features/students/components/RedeemAccessForm";
import { messages } from "@/messages/pt-BR";

const t = messages.access;

export const metadata: Metadata = { title: t.title, robots: { index: false, follow: false } };

/**
 * Só exibe o botão; o token é consumido no POST (ver redeemAccessLink). Com o link ainda válido, mostra o logo e o nome
 * do negócio do personal (lidos sem consumir o token).
 */
export default async function AccessLinkPage({ params }: PageProps<"/acesso/[token]">) {
  const { token } = await params;
  const business = await getAccessLinkBranding(token).catch(() => null);
  return (
    <>
      {business && (
        <div className="mb-5 flex items-center gap-3">
          {business.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage (fora do otimizador)
            <img src={business.logoUrl} alt="" className="size-12 rounded-xl bg-surface object-contain ring-1 ring-line" />
          )}
          <p className="text-sm font-semibold text-ink">{t.invitedBy(business.name)}</p>
        </div>
      )}
      <AuthHeading title={t.title} subtitle={t.subtitle} />
      <RedeemAccessForm token={token} />
    </>
  );
}
