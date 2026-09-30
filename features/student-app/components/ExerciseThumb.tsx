"use client";

import { Dumbbell, Play } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { videoEmbedUrl } from "@/lib/video";
import { messages } from "@/messages/pt-BR";
import type { AppExercise } from "../types";

const t = messages.aluno.run;

/**
 * Miniatura do exercício (pôster do vídeo próprio ou marcador neutro). Com vídeo, o toque abre o vídeo numa janela —
 * nada é baixado antes do toque (dados móveis; link do YouTube/Vimeo sem pré-carregar miniatura de terceiros).
 */
export function ExerciseThumb({ exercise, size = "md" }: { exercise: AppExercise; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  const embed = !exercise.video_src && exercise.video_url ? videoEmbedUrl(exercise.video_url) : null;
  const hasVideo = Boolean(exercise.video_src || embed);
  const box = size === "sm" ? "size-10 rounded-lg" : "size-16 rounded-xl";

  const face = (
    <>
      {exercise.poster_src ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage (fora do otimizador do Next)
        <img src={exercise.poster_src} alt="" className="size-full object-cover" />
      ) : (
        <Dumbbell aria-hidden className="size-1/2 text-ink-3" />
      )}
      {hasVideo && (
        <span aria-hidden className="absolute inset-0 grid place-items-center bg-black/25">
          <span className="grid size-6 place-items-center rounded-full bg-white/90 text-ink shadow">
            <Play className="size-3.5 translate-x-px fill-current" />
          </span>
        </span>
      )}
    </>
  );

  if (!hasVideo) {
    return <span className={`relative grid shrink-0 place-items-center overflow-hidden bg-canvas ring-1 ring-line ${box}`}>{face}</span>;
  }
  return (
    <>
      <button
        type="button"
        aria-label={t.openVideo(exercise.name)}
        onClick={() => setOpen(true)}
        className={`relative grid shrink-0 place-items-center overflow-hidden bg-canvas ring-1 ring-line outline-none focus-visible:ring-2 focus-visible:ring-ring ${box}`}
      >
        {face}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-3 p-3 sm:max-w-lg">
          <DialogHeader className="px-1">
            <DialogTitle className="text-base">{exercise.name}</DialogTitle>
            <DialogDescription className="sr-only">{t.video}</DialogDescription>
          </DialogHeader>
          <div className="overflow-hidden rounded-xl bg-black">
            {open && exercise.video_src ? (
              <video
                src={exercise.video_src}
                poster={exercise.poster_src ?? undefined}
                controls
                muted
                loop
                playsInline
                autoPlay
                className="aspect-video w-full"
              />
            ) : open && embed ? (
              <iframe
                src={embed}
                title={exercise.name}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className="aspect-video w-full"
              />
            ) : null}
          </div>
          {exercise.instructions && <p className="px-1 text-[13px] text-ink-2">{exercise.instructions}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
