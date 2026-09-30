import { HeartPulse, LogOut, PauseCircle } from "lucide-react";
import { requireStudent } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { signOutStudent } from "@/features/student-app/actions";
import { StudentBrand } from "@/features/student-app/components/StudentBrand";
import { StudentNav } from "@/features/student-app/components/StudentNav";
import { getMyConsentRequest, getMyProfile } from "@/features/student-app/queries";
import { HealthConsentForm } from "@/features/students/components/HealthConsentForm";
import { messages } from "@/messages/pt-BR";

const t = messages.aluno;

function Header({ name }: { name?: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-backdrop-filter:bg-surface/80">
      <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
        <StudentBrand />
        <form action={signOutStudent}>
          <Button type="submit" variant="ghost" size="sm" className="text-ink-2" aria-label={name ? `${t.nav.signOut} (${name})` : t.nav.signOut}>
            <LogOut aria-hidden />
            {t.nav.signOut}
          </Button>
        </form>
      </div>
    </header>
  );
}

/**
 * Área logada do aluno. Portões, nesta ordem: (1) acesso ativo (inativo, expirado ou bloqueado → "Acesso suspenso");
 * (2) consentimento de saúde pendente → confirmação antes de qualquer treino. Depois, o app.
 */
export default async function StudentLoggedLayout({ children }: LayoutProps<"/aluno">) {
  await requireStudent();
  const profile = await getMyProfile();
  const name = profile?.first_name;

  if (!profile || profile.effective_status !== "active") {
    return (
      <>
        <Header name={name} />
        <main className="mx-auto flex max-w-md flex-col items-center px-6 pt-16 text-center">
          <span aria-hidden className="grid size-14 place-items-center rounded-full bg-surface text-ink-2 ring-1 ring-line">
            <PauseCircle className="size-7" />
          </span>
          <h1 className="mt-5 text-xl font-semibold text-ink">{t.suspended.title}</h1>
          <p className="mt-2 text-sm text-ink-2">{t.suspended.text}</p>
          {profile && <p className="mt-6 text-xs text-ink-3">{t.trainerLine(profile.trainer_name, profile.organization_name)}</p>}
        </main>
      </>
    );
  }

  const consent = await getMyConsentRequest();
  if (consent) {
    const c = messages.consent;
    return (
      <>
        <Header name={name} />
        <main className="mx-auto flex max-w-md flex-col gap-5 px-5 py-8">
          <span aria-hidden className="grid size-11 place-items-center rounded-full bg-surface text-ink-2 ring-1 ring-line">
            <HeartPulse className="size-5" />
          </span>
          <div>
            <p className="text-xs font-medium text-ink-3">{t.consentGate}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{c.title}</h1>
            <p className="mt-2 text-sm text-ink-2">{c.intro(consent.trainer_name ?? c.trainerFallback, consent.organization_name)}</p>
          </div>
          <ul className="flex flex-wrap gap-1.5" aria-label="Dados de saúde registrados">
            {consent.group_names.map((g) => (
              <li key={g} className="rounded-md bg-surface px-2 py-1 text-[13px] font-medium text-ink ring-1 ring-line">
                {g}
              </li>
            ))}
          </ul>
          <p className="text-sm font-medium text-ink">{c.question}</p>
          <p className="text-xs leading-relaxed text-ink-3">{c.lgpd}</p>
          <HealthConsentForm nextHref="/aluno" />
        </main>
      </>
    );
  }

  return (
    <>
      <Header name={name} />
      <main className="mx-auto max-w-md px-4 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))]">{children}</main>
      <StudentNav />
    </>
  );
}
