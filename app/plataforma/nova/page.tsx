import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { CreateAccountForm } from "@/features/platform/components/CreateAccountForm";
import { messages } from "@/messages/pt-BR";

const t = messages.platform;

export default function NewAccountPage() {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <Link href="/plataforma" className="mb-2 inline-flex items-center gap-1 rounded text-xs text-ink-3 hover:text-ink">
          <ChevronLeft aria-hidden className="size-3.5" />
          {t.detail.back}
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{t.create.title}</h1>
      </header>
      <CreateAccountForm />
    </div>
  );
}
