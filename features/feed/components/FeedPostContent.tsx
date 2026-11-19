"use client";

import { ExternalLink, Play } from "lucide-react";
import { useState } from "react";
import { messages } from "@/messages/pt-BR";
import { classifyVideo, linkify, type FeedKind } from "../feed";

const t = messages.feed;
const PROVIDER = { youtube: "YouTube", vimeo: "Vimeo", instagram: "Instagram", link: "navegador" } as const;

/** Texto puro com links http(s) clicáveis (nunca HTML), abrindo fora do app sem repassar a origem. */
export function FeedText({ body }: { body: string }) {
  if (!body) return null;
  return (
    <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap text-ink">
      {linkify(body).map((part, i) =>
        part.type === "link" ? (
          <a key={i} href={part.href} target="_blank" rel="noopener noreferrer" className="link break-all">
            {part.value}
          </a>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </p>
  );
}

/** Vídeo por link: YouTube/Vimeo carregam só no toque (sem pré-carregar nada de terceiros); o resto vira cartão de link. */
export function FeedVideo({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false);
  const video = classifyVideo(url);
  if (!video) return null;
  if (!video.embed) {
    return (
      <a
        href={video.href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between gap-3 rounded-xl bg-canvas px-4 py-3 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface"
      >
        <span className="truncate">{t.video.open(PROVIDER[video.provider])}</span>
        <ExternalLink aria-hidden className="size-4 shrink-0 text-ink-3" />
      </a>
    );
  }
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-canvas ring-1 ring-line">
      {playing ? (
        <iframe
          src={video.embed}
          title={t.video.frameTitle}
          className="absolute inset-0 size-full"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="absolute inset-0 grid place-items-center text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm font-medium shadow-sm ring-1 ring-line">
            <Play aria-hidden className="size-4" />
            {t.video.play} · {PROVIDER[video.provider]}
          </span>
        </button>
      )}
    </div>
  );
}

/** Corpo do post (mesma renderização no feed do aluno, na lista do personal e na prévia do editor). */
export function FeedPostContent({ kind, body, imageUrl, videoUrl }: { kind: FeedKind; body: string; imageUrl: string | null; videoUrl: string | null }) {
  return (
    <div className="flex flex-col gap-3">
      <FeedText body={body} />
      {kind === "image" && imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage (fora do otimizador de imagens)
        <img src={imageUrl} alt={t.image.alt} loading="lazy" className="max-h-[70vh] w-full rounded-xl bg-canvas object-contain ring-1 ring-line" />
      )}
      {kind === "video" && videoUrl && <FeedVideo url={videoUrl} />}
    </div>
  );
}
