import type { Metadata } from "next";
import { LegalPage } from "@/features/legal/LegalPage";
import { TERMS_MD } from "@/features/legal/texts";

export const metadata: Metadata = { title: "Termos de Uso (rascunho)", robots: { index: false, follow: false } };

/** Termos de Uso — RASCUNHO, pendente de revisão jurídica (texto em features/legal/texts.ts). */
export default function TermsPage() {
  return <LegalPage title="Termos de Uso" markdown={TERMS_MD} />;
}
