import type { Metadata, Viewport } from "next";
import { BRAND, studentAppTitle } from "@/features/brand/config";

export const metadata: Metadata = {
  title: { default: studentAppTitle, template: `%s · ${BRAND.name}` },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "default" },
  icons: { apple: "/pwa/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BRAND.colors.background },
    { media: "(prefers-color-scheme: dark)", color: BRAND.colors.backgroundDark },
  ],
};

/** App do aluno (PWA, mobile-first): coluna estreita centralizada, fora do painel do treinador. */
export default function StudentAppLayout({ children }: LayoutProps<"/aluno">) {
  return <div className="min-h-dvh bg-canvas">{children}</div>;
}
