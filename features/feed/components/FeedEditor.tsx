"use client";

import { useRouter } from "next/navigation";
import { ImagePlus, TriangleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/db/client";
import { uuidV4 } from "@/lib/uuid";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import {
  FEED_BODY_MAX,
  FEED_SCHEDULE_MAX_DAYS,
  classifyVideo,
  feedImagePath,
  feedPostSchema,
  isoToSpLocal,
  sanitizeFeedText,
  spLocalToISO,
  toFeedPayload,
  unpinDayToISO,
  type FeedAudience,
  type FeedKind,
  type FeedModality,
  type FeedPostForm,
} from "../feed";
import { resizeFeedImage } from "../image";
import type { StaffFeedItem } from "../queries";
import { FeedPostContent } from "./FeedPostContent";

const t = messages.feed;
const BUCKET = "feed-media";
const selectClass =
  "h-10 w-full min-w-0 rounded-lg border border-line bg-surface px-2 text-base text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm";

interface Props {
  orgId: string;
  isOwner: boolean;
  classes: { id: string; name: string }[];
  /** Post em edição; nulo = novo. */
  post: StaffFeedItem | null;
  onDone: () => void;
  /** Novo post já como "recado para todos": fixado até `unpinDay` (aaaa-mm-dd). */
  defaults?: { pinned: boolean; unpinDay: string } | null;
}

/**
 * Criar/editar post. Texto puro (HTML é retirado antes de enviar), imagem reduzida no navegador e enviada ao bucket
 * privado, vídeo só por link. Do navegador direto para `save_feed_post` (o texto nunca passa por server action, toast
 * ou console). Sem órfãos: imagem enviada e não usada (falha ao salvar, troca, cancelar) é apagada.
 */
export function FeedEditor({ orgId, isOwner, classes, post, onDone, defaults = null }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<FeedKind>(post?.kind ?? "text");
  const [body, setBody] = useState(post?.body ?? "");
  const [imagePath, setImagePath] = useState<string | null>(post?.imagePath ?? null);
  const [imagePreview, setImagePreview] = useState<string | null>(post?.imageUrl ?? null);
  const [videoUrl, setVideoUrl] = useState(post?.videoUrl ?? "");
  const [audience, setAudience] = useState<FeedAudience>(post?.audience ?? "all");
  const [modality, setModality] = useState<FeedModality | null>(post?.audienceModality ?? null);
  const [classId, setClassId] = useState<string | null>(post?.audienceClassId ?? null);
  const [pinned, setPinned] = useState(post?.pinned ?? defaults?.pinned ?? false);
  // "Fixado até" (dia em SP); vazio = até desafixar.
  const [unpinDay, setUnpinDay] = useState(post?.unpinAt ? isoToSpLocal(post.unpinAt).slice(0, 10) : (defaults?.unpinDay ?? ""));
  // Hora de abertura do editor (fixa durante a edição; o banco confere de novo ao salvar).
  const [openedAt] = useState(() => Date.now());
  const wasScheduled = post !== null && new Date(post.publishedAt).getTime() > openedAt;
  const [scheduleLocal, setScheduleLocal] = useState(wasScheduled && post ? isoToSpLocal(post.publishedAt) : "");
  const [busy, setBusy] = useState<"upload" | "save" | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  // Imagens enviadas nesta edição que ainda não foram salvas num post (apagadas se não forem usadas).
  const pendingUploads = useRef(new Set<string>());

  useEffect(() => {
    const pending = pendingUploads.current;
    return () => {
      if (pending.size) void supabase.storage.from(BUCKET).remove([...pending]);
    };
  }, [supabase]);

  // Campo vazio: publica agora. Na edição, vazio mantém a data — exceto num post agendado, em que vazio = publicar agora.
  const publishAt = scheduleLocal ? spLocalToISO(scheduleLocal) : wasScheduled ? new Date(openedAt).toISOString() : null;
  const scheduleInvalid =
    scheduleLocal !== "" && (!publishAt || new Date(publishAt).getTime() > openedAt + FEED_SCHEDULE_MAX_DAYS * 86_400_000);
  const unpinAt = unpinDay ? unpinDayToISO(unpinDay) : null;
  const unpinInvalid =
    pinned && unpinDay !== "" && (!unpinAt || new Date(unpinAt).getTime() <= Math.max(openedAt, publishAt ? new Date(publishAt).getTime() : 0));
  const form: FeedPostForm = { kind, body, imagePath, videoUrl, audience, modality, classId, pinned, publishAt, unpinAt };
  const parsed = feedPostSchema.safeParse(form);
  const issues = new Set(parsed.success ? [] : parsed.error.issues.map((i) => i.message));
  const valid = parsed.success && !scheduleInvalid && !unpinInvalid;
  const cleanBody = sanitizeFeedText(body);
  const scheduled = publishAt !== null && new Date(publishAt).getTime() > openedAt;

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setBusy("upload");
    try {
      const resized = await resizeFeedImage(file);
      if ("error" in resized) return void toast.error(resized.error === "too_big" ? t.image.tooBig : t.image.invalid);
      const path = feedImagePath(orgId, uuidV4(), resized.mime);
      const { error } = await supabase.storage.from(BUCKET).upload(path, resized.blob, { contentType: resized.mime, upsert: false });
      if (error) return void toast.error(t.image.failed);
      // Troca antes de salvar: a imagem anterior desta edição não será usada.
      if (imagePath && pendingUploads.current.has(imagePath)) {
        pendingUploads.current.delete(imagePath);
        void supabase.storage.from(BUCKET).remove([imagePath]);
      }
      pendingUploads.current.add(path);
      setImagePath(path);
      setImagePreview(URL.createObjectURL(resized.blob));
    } catch {
      toast.error(t.image.failed);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async () => {
    setShowErrors(true);
    if (!parsed.success || scheduleInvalid || unpinInvalid) return;
    setBusy("save");
    try {
      const payload = toFeedPayload(parsed.data);
      const { error } = await supabase.rpc("save_feed_post", { p_data: payload, ...(post ? { p_id: post.id } : {}) });
      if (error) return void toast.error(dbErrorMessage(error));
      // A imagem salva deixa de ser pendente; a anterior do post (trocada) é apagada.
      if (imagePath) pendingUploads.current.delete(imagePath);
      const previous = post?.imagePath;
      if (previous && previous !== payload.image_path) void supabase.storage.from(BUCKET).remove([previous]);
      toast.success(post ? t.updated : scheduled ? t.savedScheduled : t.saved);
      router.refresh();
      onDone();
    } catch {
      toast.error(t.failed);
    } finally {
      setBusy(null);
    }
  };

  const err = (key: string) => showErrors && issues.has(key);

  return (
    <div className="flex flex-col gap-4">
      <p role="note" className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-ink ring-1 ring-warning-line">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        {t.warning}
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-kind`} className="text-sm font-medium text-ink">{t.kind.label}</label>
        <select id={`${id}-kind`} value={kind} onChange={(e) => setKind(e.target.value as FeedKind)} className={selectClass}>
          <option value="text">{t.kind.text}</option>
          <option value="image">{t.kind.image}</option>
          <option value="video">{t.kind.video}</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-body`} className="text-sm font-medium text-ink">{kind === "text" ? t.body.label : t.body.labelOptional}</label>
        <Textarea
          id={`${id}-body`}
          value={body}
          maxLength={FEED_BODY_MAX}
          rows={5}
          placeholder={t.body.placeholder}
          aria-invalid={err("body") || undefined}
          aria-describedby={`${id}-count`}
          onChange={(e) => setBody(e.target.value)}
          className="text-base md:text-sm"
        />
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-danger-ink">{err("body") ? t.errors.body : null}</span>
          <span id={`${id}-count`} className="text-ink-3 tabular-nums">{t.counter(body.length, FEED_BODY_MAX)}</span>
        </div>
      </div>

      {kind === "image" && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">{t.image.label}</span>
          <input
            ref={fileRef}
            id={`${id}-file`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => void pickImage(e.target.files?.[0])}
          />
          <Button type="button" variant="outline" className="self-start" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
            <ImagePlus aria-hidden />
            {busy === "upload" ? t.image.uploading : imagePath ? t.image.replace : t.image.choose}
          </Button>
          <p className="text-xs text-ink-3">{t.image.hint}</p>
          {err("image") && <p className="text-xs text-danger-ink">{t.errors.image}</p>}
        </div>
      )}

      {kind === "video" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-video`} className="text-sm font-medium text-ink">{t.video.label}</label>
          <Input
            id={`${id}-video`}
            type="url"
            inputMode="url"
            value={videoUrl}
            placeholder={t.video.placeholder}
            aria-invalid={(videoUrl !== "" && !classifyVideo(videoUrl)) || err("video") || undefined}
            onChange={(e) => setVideoUrl(e.target.value)}
            className="text-base md:text-sm"
          />
          <p className="text-xs text-ink-3">{t.video.hint}</p>
          {((videoUrl !== "" && !classifyVideo(videoUrl)) || err("video")) && <p className="text-xs text-danger-ink">{t.video.invalid}</p>}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-aud`} className="text-sm font-medium text-ink">{t.audience.label}</label>
          <select id={`${id}-aud`} value={audience} onChange={(e) => setAudience(e.target.value as FeedAudience)} className={selectClass}>
            <option value="all">{t.audience.all}</option>
            <option value="modality">{t.audience.modality}</option>
            <option value="class">{t.audience.class}</option>
          </select>
        </div>
        {audience === "modality" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-mod`} className="text-sm font-medium text-ink">{t.audience.modalityLabel}</label>
            <select
              id={`${id}-mod`}
              value={modality ?? ""}
              aria-invalid={err("modality") || undefined}
              onChange={(e) => setModality((e.target.value || null) as FeedModality | null)}
              className={selectClass}
            >
              <option value="">—</option>
              {(["consultoria", "presencial", "hibrido"] as const).map((m) => (
                <option key={m} value={m}>{t.modality[m]}</option>
              ))}
            </select>
            {err("modality") && <p className="text-xs text-danger-ink">{t.errors.modality}</p>}
          </div>
        )}
        {audience === "class" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-class`} className="text-sm font-medium text-ink">{t.audience.classLabel}</label>
            {classes.length === 0 ? (
              <p className="text-xs text-ink-3">{t.audience.noClasses}</p>
            ) : (
              <select
                id={`${id}-class`}
                value={classId ?? ""}
                aria-invalid={err("class") || undefined}
                onChange={(e) => setClassId(e.target.value || null)}
                className={selectClass}
              >
                <option value="">{t.audience.chooseClass}</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            {err("class") && <p className="text-xs text-danger-ink">{t.errors.class}</p>}
          </div>
        )}
      </div>
      {!isOwner && <p className="-mt-2 text-xs text-ink-3">{t.audience.ownStudents}</p>}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-when`} className="text-sm font-medium text-ink">{t.schedule.label}</label>
        <Input
          id={`${id}-when`}
          type="datetime-local"
          value={scheduleLocal}
          aria-invalid={scheduleInvalid || undefined}
          onChange={(e) => setScheduleLocal(e.target.value)}
          className="text-base sm:max-w-64 md:text-sm"
        />
        <p className="text-xs text-ink-3">{t.schedule.hint}</p>
        {scheduleInvalid && <p className="text-xs text-danger-ink">{t.schedule.tooFar}</p>}
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="size-4 accent-[var(--color-control)]" />
        {t.pin}
      </label>
      {pinned && (
        <div className="-mt-2 flex flex-col gap-1.5">
          <label htmlFor={`${id}-unpin`} className="text-sm font-medium text-ink">{t.unpinAt.label}</label>
          <Input id={`${id}-unpin`} type="date" value={unpinDay} aria-invalid={unpinInvalid || undefined} onChange={(e) => setUnpinDay(e.target.value)} className="text-base sm:max-w-48 md:text-sm" />
          <p className={`text-xs ${unpinInvalid ? "text-danger-ink" : "text-ink-3"}`}>{unpinInvalid ? t.unpinAt.invalid : t.unpinAt.hint}</p>
        </div>
      )}

      <section aria-labelledby={`${id}-preview`} className="flex flex-col gap-2 rounded-2xl bg-canvas p-3 ring-1 ring-line">
        <h3 id={`${id}-preview`} className="text-xs font-medium text-ink-3">{t.preview}</h3>
        {cleanBody || (kind === "image" && imagePreview) || (kind === "video" && classifyVideo(videoUrl)) ? (
          <div className="rounded-xl bg-surface p-3 ring-1 ring-line">
            <FeedPostContent kind={kind} body={cleanBody} imageUrl={kind === "image" ? imagePreview : null} videoUrl={kind === "video" ? videoUrl : null} />
          </div>
        ) : (
          <p className="text-xs text-ink-3">{t.previewEmpty}</p>
        )}
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy === "save"} onClick={onDone}>{t.cancel}</Button>
        <Button type="button" disabled={busy !== null || (showErrors && !valid)} onClick={() => void save()}>
          {busy === "save" ? t.saving : post ? t.saveEdit : scheduled ? t.saveScheduled : t.save}
        </Button>
      </div>
    </div>
  );
}
