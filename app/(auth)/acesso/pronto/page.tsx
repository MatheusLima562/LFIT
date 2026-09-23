import type { Metadata } from "next";
import { CircleCheck } from "lucide-react";
import { messages } from "@/messages/pt-BR";

const t = messages.access;

export const metadata: Metadata = { title: t.readyTitle };

export default async function AccessReadyPage({ searchParams }: PageProps<"/acesso/pronto">) {
  const { consentimento } = await searchParams;
  const consentNote =
    consentimento === "aceito" ? messages.consent.accepted : consentimento === "recusado" ? messages.consent.declined : null;
  return (
    <div className="flex flex-col items-start gap-4">
      <span aria-hidden className="grid size-12 place-items-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
        <CircleCheck className="size-6" />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{t.readyTitle}</h1>
      <p className="text-sm text-ink-2">{t.readyText}</p>
      {consentNote && <p className="text-sm text-ink-2">{consentNote}</p>}
    </div>
  );
}
