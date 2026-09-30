import type { Metadata } from "next";
import { StudentBrand } from "@/features/student-app/components/StudentBrand";
import { StudentSignInForm } from "@/features/student-app/components/StudentSignInForm";
import { messages } from "@/messages/pt-BR";

const t = messages.aluno.signIn;

export const metadata: Metadata = { title: t.title };

export default function StudentSignInPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-8">
      <StudentBrand />
      <div className="flex flex-1 flex-col justify-center py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t.title}</h1>
        <p className="mt-1.5 mb-6 text-sm text-ink-2">{t.subtitle}</p>
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <StudentSignInForm />
        </div>
      </div>
    </main>
  );
}
