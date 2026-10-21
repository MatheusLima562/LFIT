import type { Metadata } from "next";
import { LegalPage } from "@/features/legal/LegalPage";
import { PRIVACY_MD } from "@/features/legal/texts";

export const metadata: Metadata = { title: "Política de Privacidade (rascunho)", robots: { index: false, follow: false } };

/** Política de Privacidade — RASCUNHO, pendente de revisão jurídica (texto em features/legal/texts.ts). */
export default function PrivacyPage() {
  return <LegalPage title="Política de Privacidade" markdown={PRIVACY_MD} />;
}
