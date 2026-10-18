import type { Metadata } from "next";
import { Building2, CircleCheck, Clock, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutStudent } from "@/features/student-app/actions";
import { initials } from "@/features/student-app/humanize";
import { TrainerAvatar } from "@/features/student-app/components/TrainerAvatar";
import { getMyPhotoUrl, getMyProfile } from "@/features/student-app/queries";
import { messages } from "@/messages/pt-BR";

const t = messages.aluno;

export const metadata: Metadata = { title: t.profile.title };

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span aria-hidden className="mt-0.5 text-ink-3">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-ink-3">{label}</dt>
        <dd className="text-[15px] text-ink">{children}</dd>
      </div>
    </div>
  );
}

/** Perfil do aluno: quem é, de qual estúdio, quem acompanha (e em que horário) e o "Sair". */
export default async function StudentProfilePage() {
  // Roda em paralelo ao layout: sem perfil/acesso, quem mostra o portão é o layout.
  const profile = await getMyProfile();
  if (!profile || profile.effective_status !== "active") return null;
  const photo = await getMyPhotoUrl(profile.photo_path);
  const fullName = `${profile.first_name} ${profile.last_name}`.trim();

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col items-center pt-2 text-center">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage (fora do otimizador do Next)
          <img src={photo} alt="" className="size-20 rounded-full object-cover ring-1 ring-line" />
        ) : (
          <span aria-hidden className="grid size-20 place-items-center rounded-full bg-canvas text-xl font-semibold text-ink-2 ring-1 ring-line">
            {initials(fullName)}
          </span>
        )}
        <h1 className="mt-3 text-xl font-semibold tracking-tight text-ink">{fullName}</h1>
      </section>

      <dl className="divide-y divide-line rounded-2xl border border-line bg-surface shadow-card">
        <Row icon={<Building2 className="size-4" />} label={t.profile.organization}>
          {profile.organization_name}
        </Row>
        <div className="flex items-start gap-3 px-4 py-3">
          <TrainerAvatar name={profile.trainer_name} className="size-9 text-xs" />
          <div className="min-w-0">
            <dt className="text-xs font-medium text-ink-3">{t.profile.trainer}</dt>
            <dd className="text-[15px] text-ink">{profile.trainer_name ?? t.profile.noTrainer}</dd>
          </div>
        </div>
        {profile.trainer_office_hours && (
          <Row icon={<Clock className="size-4" />} label={t.profile.officeHours}>
            {profile.trainer_office_hours}
          </Row>
        )}
        <Row icon={<CircleCheck className="size-4" />} label={t.profile.access}>
          {t.profile.active}
        </Row>
      </dl>

      <form action={signOutStudent}>
        <Button type="submit" variant="outline" size="lg" className="h-12 w-full text-base">
          <LogOut aria-hidden />
          {t.profile.signOut}
        </Button>
      </form>
    </div>
  );
}
