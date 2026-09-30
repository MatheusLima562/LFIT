import type { MetadataRoute } from "next";

/** PWA do aluno: instalável a partir de /aluno (sem service worker nesta fase — a fila local cobre internet ruim). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LFit — Meu treino",
    short_name: "LFit",
    description: "Seu treino, série a série.",
    start_url: "/aluno",
    scope: "/aluno",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f7f5",
    theme_color: "#f7f7f5",
    lang: "pt-BR",
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
