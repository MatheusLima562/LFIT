"use client";

import { PlayCircle, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { videoEmbedUrl } from "@/lib/video";
import { messages } from "@/messages/pt-BR";
import type { AppExercise } from "../types";

const t = messages.aluno.run;

/** Vídeo do exercício só carrega no clique (economia de dados na academia). Arquivo próprio tem prioridade sobre o link. */
export function ExerciseMedia({ exercise }: { exercise: AppExercise }) {
  const [open, setOpen] = useState(false);
  const embed = !exercise.video_src && exercise.video_url ? videoEmbedUrl(exercise.video_url) : null;
  if (!exercise.video_src && !embed) return null;

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} aria-label={`${t.video}: ${exercise.name}`}>
        <PlayCircle aria-hidden />
        {t.video}
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-xl bg-black ring-1 ring-line">
        {exercise.video_src ? (
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
        ) : (
          <iframe
            src={embed!}
            title={exercise.name}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="aspect-video w-full"
          />
        )}
      </div>
      <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setOpen(false)}>
        <X aria-hidden />
        {t.hideVideo}
      </Button>
    </div>
  );
}
