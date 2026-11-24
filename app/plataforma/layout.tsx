import type { Metadata } from "next";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandGlyph } from "@/features/brand/BrandMark";
import { signOut } from "@/features/auth/actions";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { messages } from "@/messages/pt-BR";

const t = messages.platform;

export const metadata: Metadata = { title: t.title, robots: { index: false, follow: false } };

/**
 * Painel da PLATAFORMA. Portão próprio (lista `private.platform_admins`), fora do AppShell da organização: o admin pode
 * nem ter perfil em organização nenhuma. Quem não está na lista recebe 404.
 */
export default async function PlatformLayout({ children }: LayoutProps<"/plataforma">) {
  const admin = await requirePlatformAdmin();
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/plataforma" className="flex items-center gap-2 rounded text-sm font-semibold text-ink">
            <span aria-hidden className="grid size-8 place-items-center rounded-[10px] bg-linear-to-br from-brand-400 to-brand-600">
              <BrandGlyph className="text-white" />
            </span>
            <span>{t.title}</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden truncate text-xs text-ink-3 sm:inline">{admin.email}</span>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                <LogOut aria-hidden />
                {t.signOut}
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
