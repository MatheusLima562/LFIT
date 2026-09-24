"use client";

import { Film, Link2, Trash2, Upload, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { prepareVideo, type PreparedVideo } from "../video";

const t = messages.exercises.media;

export interface VideoFieldState {
  prepared: (PreparedVideo & { name: string }) | null;
  removeCurrent: boolean;
  busy: boolean;
}

interface Props {
  hasCurrent: boolean;
  quotaBytes: number;
  /** Uso da organização sem contar o vídeo atual deste exercício. */
  usedBytes: number;
  state: VideoFieldState;
  onChange: (state: VideoFieldState) => void;
  /** Campo de link (registrado no formulário). */
  linkField: ReactNode;
  initialTab: "link" | "upload";
}

/** Mídia do exercício: link (YouTube/Vimeo) e/ou vídeo enviado (tem prioridade na exibição). */
export function VideoField({ hasCurrent, quotaBytes, usedBytes, state, onChange, linkField, initialTab }: Props) {
  const [tab, setTab] = useState(initialTab);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compressNote, setCompressNote] = useState<string | null>(null);
  const [overQuota, setOverQuota] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setOverQuota(false);
    setCompressNote(null);
    setProgress(0);
    onChange({ ...state, busy: true });
    const r = await prepareVideo(file, setProgress);
    setProgress(null);
    if (!r.ok) {
      setError(r.error);
      onChange({ ...state, busy: false });
      return;
    }
    if (usedBytes + r.video.file.size + (r.video.poster?.size ?? 0) > quotaBytes) {
      setError(t.errors.quota);
      setOverQuota(true);
      onChange({ ...state, busy: false });
      return;
    }
    setCompressNote(r.video.compressed ? t.compressed(formatBytes(file.size), formatBytes(r.video.file.size)) : t.notCompressed);
    onChange({ prepared: { ...r.video, name: file.name }, removeCurrent: false, busy: false });
  };

  const tabButton = (id: "link" | "upload", label: string, icon: ReactNode) => (
    <button
      type="button"
      role="tab"
      id={`media-tab-${id}`}
      aria-selected={tab === id}
      aria-controls={`media-panel-${id}`}
      onClick={() => setTab(id)}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
        tab === id ? "bg-brand-50 text-brand-700" : "text-ink-2 hover:text-ink",
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-ink">{t.title}</h3>
        <p className="mt-0.5 text-xs text-ink-3">{t.hint}</p>
      </div>
      <div role="tablist" aria-label={t.title} className="flex w-fit gap-1 rounded-xl border border-line bg-surface p-1">
        {tabButton("link", t.linkTab, <Link2 aria-hidden className="size-4" />)}
        {tabButton("upload", t.uploadTab, <Upload aria-hidden className="size-4" />)}
      </div>

      <div role="tabpanel" id="media-panel-link" aria-labelledby="media-tab-link" hidden={tab !== "link"}>
        {linkField}
      </div>

      <div role="tabpanel" id="media-panel-upload" aria-labelledby="media-tab-upload" hidden={tab !== "upload"} className="flex flex-col gap-2">
        {quotaBytes === 0 ? (
          <div className="flex flex-col gap-2 rounded-xl bg-canvas px-3 py-3">
            <p className="text-[13px] text-ink-2">{t.freePlan}</p>
            <Button type="button" size="sm" disabled title={messages.app.soonHint} className="w-fit">
            {t.upgrade} · {messages.app.soon}
          </Button>
          </div>
        ) : (
          <>
            <input
              ref={input}
              type="file"
              accept="video/mp4,video/webm,.mp4,.webm"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {state.prepared ? (
              <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-[13px]">
                <Film aria-hidden className="size-4 shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1 truncate text-ink-2">
                  {t.pending(state.prepared.name)} ({formatBytes(state.prepared.file.size)})
                </span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={messages.plans.manage.cancel} onClick={() => onChange({ ...state, prepared: null })}>
                  <X aria-hidden />
                </Button>
              </div>
            ) : hasCurrent && !state.removeCurrent ? (
              <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-[13px]">
                <Film aria-hidden className="size-4 shrink-0 text-ink-3" />
                <span className="flex-1 text-ink-2">{t.current}</span>
                <Button type="button" variant="ghost" size="sm" className="hover:text-danger" onClick={() => onChange({ ...state, removeCurrent: true })}>
                  <Trash2 aria-hidden />
                  {t.remove}
                </Button>
              </div>
            ) : (
              state.removeCurrent && <p className="text-[13px] text-ink-2">{t.willRemove}</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={state.busy} onClick={() => input.current?.click()}>
                <Upload aria-hidden />
                {hasCurrent || state.prepared ? t.replace : t.choose}
              </Button>
              {progress !== null && (
                <span role="status" className="text-[13px] text-ink-2">
                  {t.processing(progress)}
                </span>
              )}
            </div>
            {compressNote && !error && <p className="text-xs text-ink-3">{compressNote}</p>}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {overQuota && (<Button type="button" size="sm" disabled title={messages.app.soonHint} className="w-fit">
            {t.upgrade} · {messages.app.soon}
          </Button>)}
            <p className="text-xs text-ink-3">{t.limits}</p>
          </>
        )}
      </div>
    </section>
  );
}
