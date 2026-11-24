import type { Metadata } from "next";
import { CircleCheck, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutStudent } from "@/features/student-app/actions";
import { initials } from "@/features/student-app/humanize";
import { MyPlanCard } from "@/features/student-app/components/MyPlanCard";
import { TrainerAvatar } from "@/features/student-app/components/TrainerAvatar";
import { getMyPhotoUrl, getMyPlanSummary, getMyProfile } from "@/features/student-app/queries";
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

/** Perfil do aluno: quem é, quem acompanha, situação do acesso, "Meu plano" (se houver) e o "Sair". */
export default async function StudentProfilePage() {
  // Roda em paralelo ao layout: sem perfil/acesso, quem mostra o portão é o layout.
  const profile = await getMyProfile();
  if (!profile || profile.effective_status !== "active") return null;
  const [photo, plan] = await Promise.all([getMyPhotoUrl(profile.photo_path), getMyPlanSummary()]);
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

      {/* Consultoria a distância: sem "Estúdio" nem "Atendimento" no Perfil (pedido do dono). */}
      <dl className="divide-y divide-line rounded-2xl border border-line bg-surface shadow-card">
        <div className="flex items-start gap-3 px-4 py-3">
          <TrainerAvatar name={profile.trainer_name ?? profile.personal_name} className="size-9 text-xs" />
          <div className="min-w-0">
            <dt className="text-xs font-medium text-ink-3">{profile.trainer_name ? t.profile.trainer : t.profile.personalTitle}</dt>
            <dd className="text-[15px] text-ink">{profile.trainer_name ?? t.profile.noTrainer(profile.personal_name)}</dd>
          </div>
        </div>
        <Row icon={<CircleCheck className="size-4" />} label={t.profile.access}>
          {t.profile.active}
        </Row>
      </dl>

      {plan && <MyPlanCard plan={plan} />}

      <form action={signOutStudent}>
        <Button type="submit" variant="outline" size="lg" className="h-12 w-full text-base">
          <LogOut aria-hidden />
          {t.profile.signOut}
        </Button>
      </form>
    </div>
  );
}
