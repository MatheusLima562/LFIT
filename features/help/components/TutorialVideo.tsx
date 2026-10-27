"use client";

import { Play } from "lucide-react";
import { useState } from "react";
import { messages } from "@/messages/pt-BR";
import type { TutorialVideoProvider } from "../video";

const t = messages.help.video;

/** Vídeo do tutorial no topo da página. Como nos vídeos de exercício, o player só carrega no clique. */
export function TutorialVideo({ src, provider, title }: { src: string; provider: TutorialVideoProvider; title: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="mb-6">
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-canvas ring-1 ring-line">
        {loaded ? (
          <iframe
            src={`${src}${src.includes("?") ? "&" : "?"}autoplay=1`}
            title={t.title(title)}
            className="size-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          />
        ) : (
          <button
            type="button"
            onClick={() => setLoaded(true)}
            className="group flex size-full flex-col items-center justify-center gap-3 text-ink-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
          >
            <span aria-hidden className="grid size-14 place-items-center rounded-full bg-surface text-ink shadow-card ring-1 ring-line transition-transform group-hover:scale-105">
              <Play className="size-6 translate-x-0.5" />
            </span>
            <span className="text-[15px] font-semibold text-ink">{t.play}</span>
          </button>
        )}
      </div>
      <p className="mt-1.5 text-xs text-ink-3">{t.privacy(provider)}</p>
    </div>
  );
}
