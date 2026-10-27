import type { MetadataRoute } from "next";
import { BRAND, studentAppTitle } from "@/features/brand/config";

/** PWA do aluno: instalável a partir de /aluno (sem service worker nesta fase — a fila local cobre internet ruim). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: studentAppTitle,
    short_name: BRAND.name,
    description: BRAND.studentApp.description,
    start_url: "/aluno",
    scope: "/aluno",
    display: "standalone",
    orientation: "portrait",
    background_color: BRAND.colors.background,
    theme_color: BRAND.colors.background,
    lang: "pt-BR",
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
