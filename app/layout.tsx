import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BRAND, productTitle } from "@/features/brand/config";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: productTitle,
    template: `%s · ${BRAND.name}`,
  },
  description: "Plataforma de gestão de alunos, treinos, avaliações e vendas para personal trainers.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BRAND.colors.background },
    { media: "(prefers-color-scheme: dark)", color: BRAND.colors.backgroundDark },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // next-themes altera a classe do <html> antes da hidratação.
    <html lang="pt-BR" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
