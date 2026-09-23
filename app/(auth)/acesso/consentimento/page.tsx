import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HeartPulse } from "lucide-react";
import { createClient } from "@/lib/db/server";
import { HealthConsentForm } from "@/features/students/components/HealthConsentForm";
import { messages } from "@/messages/pt-BR";

const t = messages.consent;

export const metadata: Metadata = { title: t.title, robots: { index: false, follow: false } };

/** Primeiro acesso do aluno: confirma (ou recusa) o consentimento declarado pelo professor. */
export default async function HealthConsentPage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_my_health_consent_request");
  const request = data?.[0];
  if (!request) redirect("/acesso/concluir");

  return (
    <div className="flex flex-col gap-5">
      <span aria-hidden className="grid size-11 place-items-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-100">
        <HeartPulse className="size-5" />
      </span>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t.title}</h1>
        <p className="mt-2 text-sm text-ink-2">
          {t.intro(request.trainer_name ?? t.trainerFallback, request.organization_name)}
        </p>
      </div>
      <ul className="flex flex-wrap gap-1.5" aria-label="Dados de saúde registrados">
        {request.group_names.map((name) => (
          <li key={name} className="rounded-md bg-canvas px-2 py-1 text-[13px] font-medium text-ink ring-1 ring-line">
            {name}
          </li>
        ))}
      </ul>
      <p className="text-sm font-medium text-ink">{t.question}</p>
      <p className="text-xs leading-relaxed text-ink-3">{t.lgpd}</p>
      <HealthConsentForm />
    </div>
  );
}
