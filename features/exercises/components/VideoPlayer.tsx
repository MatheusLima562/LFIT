"use client";

import { Play } from "lucide-react";
import { useState } from "react";
import { messages } from "@/messages/pt-BR";

/**
 * Vídeo próprio: nada é baixado até o clique (preload="none"); mudo, em loop e inline,
 * como uma demonstração de movimento. A URL assinada é estável por dias → cache do navegador.
 */
export function VideoPlayer({ url, posterUrl, title }: { url: string; posterUrl: string | null; title: string }) {
  const [playing, setPlaying] = useState(false);
  if (playing) {
    return (
      <video
        src={url}
        poster={posterUrl ?? undefined}
        muted
        loop
        playsInline
        autoPlay
        controls
        preload="none"
        aria-label={`${messages.exercises.video}: ${title}`}
        className="aspect-video w-full rounded-xl bg-black object-contain"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className="group relative grid aspect-video w-full place-items-center overflow-hidden rounded-xl bg-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      aria-label={`${messages.exercises.media.play}: ${title}`}
    >
      {posterUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage (fora do otimizador de imagens)
        <img src={posterUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-contain opacity-90" />
      )}
      <span className="relative grid size-14 place-items-center rounded-full bg-white/90 text-zinc-900 shadow-lg transition group-hover:scale-105">
        <Play aria-hidden className="ml-0.5 size-6" />
      </span>
    </button>
  );
}
