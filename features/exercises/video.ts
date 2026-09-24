/**
 * Vídeo próprio do exercício (cliente): validação, compressão nativa do navegador
 * (canvas + MediaRecorder, sem dependências) e poster do primeiro quadro.
 * Os mesmos limites são aplicados no servidor pelo bucket (tipo e 15 MB) e pelo
 * gatilho exercises_media_guard (tipo, tamanho, cota). A duração só é verificável aqui.
 */
import { messages } from "@/messages/pt-BR";

const t = messages.exercises.media;

export const VIDEO_MAX_BYTES = 15 * 1024 * 1024;
export const VIDEO_MAX_SECONDS = 30;
/** Acima disso nem tentamos processar no navegador (memória). */
const INPUT_MAX_BYTES = 200 * 1024 * 1024;
export const VIDEO_TYPES = { "video/mp4": "mp4", "video/webm": "webm" } as const;
export type VideoMime = keyof typeof VIDEO_TYPES;

export type VideoCheck = { ok: true; mime: VideoMime } | { ok: false; error: string };

/** Tipo e extensão (os dois precisam bater com MP4/WebM). */
export function checkVideoType(file: { name: string; type: string; size: number }): VideoCheck {
  const ext = file.name.toLowerCase().split(".").pop();
  const mime = file.type as VideoMime;
  if (!(mime in VIDEO_TYPES) || !["mp4", "webm"].includes(ext ?? "")) return { ok: false, error: t.errors.type };
  if (file.size > INPUT_MAX_BYTES) return { ok: false, error: t.errors.size(file.size) };
  return { ok: true, mime };
}

function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onloadedmetadata = () => resolve(v);
    v.onerror = () => reject(new Error(t.errors.unreadable));
    v.src = src;
  });
}

/** Duração em segundos (WebM gravado pelo navegador às vezes informa Infinity até buscar o fim). */
async function durationOf(v: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(v.duration)) return v.duration;
  return new Promise((resolve) => {
    v.ontimeupdate = () => {
      v.ontimeupdate = null;
      const d = v.duration;
      v.currentTime = 0;
      resolve(Number.isFinite(d) ? d : 0);
    };
    v.currentTime = 1e9;
  });
}

function targetSize(v: HTMLVideoElement) {
  // 720p = lado menor com até 720 px; dimensões pares (exigência de codecs).
  const scale = Math.min(1, 720 / Math.min(v.videoWidth, v.videoHeight));
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(v.videoWidth), height: even(v.videoHeight) };
}

async function posterOf(v: HTMLVideoElement): Promise<Blob | null> {
  await new Promise<void>((resolve) => {
    v.onseeked = () => resolve();
    v.currentTime = Math.min(0.1, (v.duration || 1) / 2);
  });
  const { width, height } = targetSize(v);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(v, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.8));
}

function recorderMime() {
  if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement.prototype.captureStream !== "function") return null;
  return ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

/** Recodifica em 720p sem áudio, em tempo real (≤ 30 s). null = navegador sem suporte. */
async function compress(v: HTMLVideoElement, onProgress: (pct: number) => void): Promise<Blob | null> {
  const mime = recorderMime();
  if (!mime) return null;
  const { width, height } = targetSize(v);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_500_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));

  v.currentTime = 0;
  v.loop = false;
  recorder.start(250);
  await v.play();
  await new Promise<void>((resolve) => {
    const draw = () => {
      ctx.drawImage(v, 0, 0, width, height);
      onProgress(Math.min(99, Math.round((v.currentTime / (v.duration || 1)) * 100)));
      if (v.ended || v.paused) return resolve();
      requestAnimationFrame(draw);
    };
    draw();
  });
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((track) => track.stop());
  onProgress(100);
  return new Blob(chunks, { type: mime.split(";")[0] });
}

export interface PreparedVideo {
  file: Blob;
  mime: VideoMime;
  poster: Blob | null;
  compressed: boolean;
}

/**
 * Valida (tipo, extensão, duração), tenta comprimir para 720p sem áudio e gera o poster.
 * Mantém o original se a compressão não reduzir o tamanho. Erros em PT-BR com dicas.
 */
export async function prepareVideo(file: File, onProgress: (pct: number) => void): Promise<{ ok: true; video: PreparedVideo } | { ok: false; error: string }> {
  const type = checkVideoType(file);
  if (!type.ok) return type;
  const url = URL.createObjectURL(file);
  try {
    const v = await loadVideo(url);
    const seconds = await durationOf(v);
    if (seconds > VIDEO_MAX_SECONDS + 0.5) return { ok: false, error: t.errors.duration(seconds) };
    const poster = await posterOf(v).catch(() => null);

    let out: Blob = file;
    let mime: VideoMime = type.mime;
    let compressed = false;
    const smaller = await compress(v, onProgress).catch(() => null);
    if (smaller && smaller.size > 0 && smaller.size < file.size) {
      out = smaller;
      mime = smaller.type as VideoMime;
      compressed = true;
    }
    if (out.size > VIDEO_MAX_BYTES) return { ok: false, error: t.errors.size(out.size) };
    return { ok: true, video: { file: out, mime, poster, compressed } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t.errors.unreadable };
  } finally {
    URL.revokeObjectURL(url);
  }
}
