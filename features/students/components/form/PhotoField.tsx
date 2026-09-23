"use client";

import { Camera, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { messages } from "@/messages/pt-BR";
import { StudentAvatar } from "@/components/students/StudentAvatar";
import { Button } from "@/components/ui/button";

const t = messages.studentForm;
export const PHOTO_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export interface PhotoValue {
  file: File | null;
  removed: boolean;
}

interface PhotoFieldProps {
  name: string;
  currentUrl: string | null;
  value: PhotoValue;
  onChange: (value: PhotoValue) => void;
  onError: (message: string | null) => void;
}

/** Foto do aluno: prévia local; o upload acontece depois de salvar (precisa do id do aluno). */
export function PhotoField({ name, currentUrl, value, onChange, onError }: PhotoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (value.file ? URL.createObjectURL(value.file) : null), [value.file]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const shown = preview ?? (value.removed ? null : currentUrl);

  return (
    <div className="flex items-center gap-4">
      <StudentAvatar name={name || "?"} photoUrl={shown} size="lg" className="size-16 text-lg" />
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={shown ? `${t.photoChange} ${t.photo.toLowerCase()}` : t.photoAdd}
            onClick={() => inputRef.current?.click()}
          >
            <Camera aria-hidden />
            {shown ? t.photoChange : t.photoAdd}
          </Button>
          {shown && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`${t.photoRemove} ${t.photo.toLowerCase()}`}
              onClick={() => onChange({ file: null, removed: true })}
            >
              <Trash2 aria-hidden />
              {t.photoRemove}
            </Button>
          )}
        </div>
        <p className="text-xs text-ink-3">{t.photoHint}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={Object.keys(PHOTO_TYPES).join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-label={t.photo}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (!(file.type in PHOTO_TYPES)) return onError(t.errors.photoType);
          if (file.size > PHOTO_MAX_BYTES) return onError(t.errors.photoSize);
          onError(null);
          onChange({ file, removed: false });
        }}
      />
    </div>
  );
}
