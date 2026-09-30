import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: { default: "LFit — Meu treino", template: "%s · LFit" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "LFit", statusBarStyle: "default" },
  icons: { apple: "/pwa/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0e" },
  ],
};

/** App do aluno (PWA, mobile-first): coluna estreita centralizada, fora do painel do treinador. */
export default function StudentAppLayout({ children }: LayoutProps<"/aluno">) {
  return <div className="min-h-dvh bg-canvas">{children}</div>;
}
