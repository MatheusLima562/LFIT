"use client";

import { Play } from "lucide-react";
import { useState } from "react";
import { videoEmbedUrl } from "@/lib/video";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";

const t = messages.exercises;

/** Carrega o player só no clique (sem cookies/rastreamento antes disso). */
export function VideoEmbed({ url, title }: { url: string; title: string }) {
  const [loaded, setLoaded] = useState(false);
  const src = videoEmbedUrl(url);
  if (!src) return null;
  if (!loaded) {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <Button variant="outline" onClick={() => setLoaded(true)}>
          <Play aria-hidden />
          {t.playVideo}
        </Button>
        <p className="text-xs text-ink-3">{t.videoPrivacy}</p>
      </div>
    );
  }
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
      <iframe
        src={src}
        title={`${t.video}: ${title}`}
        className="size-full"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation"
      />
    </div>
  );
}
