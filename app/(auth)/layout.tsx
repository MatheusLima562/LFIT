import { Check } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { messages } from "@/messages/pt-BR";

const t = messages.auth;

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Painel da marca (desktop) */}
      <aside className="relative isolate hidden overflow-hidden bg-linear-to-br from-[#9a320e] via-[#c2461a] to-[#e2632c] p-10 text-white lg:flex lg:flex-col">
        <span aria-hidden className="absolute -top-24 -right-24 -z-10 size-96 rounded-full bg-white/10" />
        <span aria-hidden className="absolute -bottom-32 -left-16 -z-10 size-[28rem] rounded-full bg-black/10" />
        <span aria-hidden className="absolute top-1/2 right-16 -z-10 size-3 rounded-full bg-white/40" />

        <div className="flex items-center gap-2.5">
          <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 4v13h10" />
              <path d="M13 10h4" />
            </svg>
          </span>
          <span className="text-lg font-bold tracking-tight">{messages.app.name}</span>
        </div>

        <div className="mt-auto max-w-md">
          <p className="text-3xl leading-tight font-semibold tracking-tight text-balance">{t.brandTitle}</p>
          <ul className="mt-8 flex flex-col gap-3.5">
            {t.brandItems.map((item) => (
              <li key={item} className="flex items-center gap-3 text-[15px] text-white/95">
                <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-white/20">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-16 text-xs text-white/80">
          © {new Date().getFullYear()} {messages.app.name} · {messages.app.tagline}
        </p>
      </aside>

      {/* Formulário */}
      <main className="relative flex flex-col bg-surface px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between lg:justify-end">
          <div className="lg:hidden">
            <Logo />
          </div>
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  );
}
