import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth/session";
import { TrainingListsManager } from "@/features/training-lists/components/TrainingListsManager";
import { getTrainingLists } from "@/features/training-lists/queries";
import { messages } from "@/messages/pt-BR";

const t = messages.trainingLists;

export const metadata: Metadata = { title: t.title };

export default async function TrainingListsPage() {
  const session = await requireStaff();
  const lists = await getTrainingLists();
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-[22px]">{t.title}</h1>
        <p className="mt-0.5 max-w-2xl text-[13px] text-ink-2">{t.subtitle}</p>
      </header>
      <TrainingListsManager lists={lists} isOwner={session.role === "owner"} />
    </div>
  );
}
