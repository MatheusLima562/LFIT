import { z } from "zod";
import { videoEmbedUrl } from "@/lib/video";

/**
 * Feed (Comunidade), fase 1 — lógica pura, sem banco. As mesmas regras estão no banco (`20261119160000_feed.sql`):
 * texto puro até 2000, vídeo só por link https de YouTube/Vimeo/Instagram, imagem JPEG/WebP até 5 MB.
 */
export const FEED_BODY_MAX = 2000;
export const FEED_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** Lado maior da imagem depois do redimensionamento no navegador. */
export const FEED_IMAGE_MAX_DIM = 1600;
export const FEED_SCHEDULE_MAX_DAYS = 365;

export type FeedKind = "text" | "image" | "video";
export type FeedAudience = "all" | "modality" | "class";
export type FeedModality = "consultoria" | "presencial" | "hibrido";

/** Mesmo padrão do CHECK de `feed_posts.video_url`. */
export const FEED_VIDEO_RE = /^https:\/\/((www|m)\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com|instagram\.com)\/[^\s<>"']*$/;
/** Mesmo padrão do CHECK de `feed_posts.body` (o banco recusa; o editor tira antes de enviar). */
export const FEED_HTML_RE = /<[A-Za-z/!?]/;

/** Texto puro: tira marcações HTML (inclusive uma aberta no fim), normaliza quebras de linha e espaços nas pontas. */
export function sanitizeFeedText(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/<\/?[A-Za-z!?][^>]*(>|$)/g, "")
    .replace(/<(?=[A-Za-z/!?])/g, "")
    .trim();
}

/** Só http/https viram link; qualquer outro esquema (javascript:, data:, vbscript:…) fica como texto. */
export function safeHref(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
}

export type TextPart = { type: "text"; value: string } | { type: "link"; value: string; href: string };

/** Quebra o texto em pedaços de texto e links http(s) — renderizados como texto/`<a>`, nunca como HTML. */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const re = /\bhttps?:\/\/[^\s<>"']+/gi;
  let last = 0;
  for (const m of text.matchAll(re)) {
    let raw = m[0];
    // Pontuação final costuma ser da frase, não do link.
    const trail = raw.match(/[.,;:!?)\]]+$/)?.[0] ?? "";
    if (trail) raw = raw.slice(0, -trail.length);
    const href = safeHref(raw);
    const start = m.index ?? 0;
    if (start > last) parts.push({ type: "text", value: text.slice(last, start) });
    parts.push(href ? { type: "link", value: raw, href } : { type: "text", value: raw });
    last = start + raw.length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts.filter((p) => p.value.length > 0);
}

export type FeedVideo =
  | { provider: "youtube" | "vimeo"; href: string; embed: string }
  | { provider: "instagram" | "link"; href: string; embed: null };

/** Vídeo por link: embed para YouTube/Vimeo (youtube-nocookie, Vimeo dnt), cartão de link para Instagram. */
export function classifyVideo(url: string): FeedVideo | null {
  const value = url.trim();
  if (!FEED_VIDEO_RE.test(value) || value.length > 500) return null;
  const href = safeHref(value);
  if (!href || !href.startsWith("https://")) return null;
  const host = new URL(href).hostname.replace(/^(www|m)\./, "");
  if (host === "instagram.com") return { provider: "instagram", href, embed: null };
  const embed = videoEmbedUrl(value);
  if (!embed) return { provider: "link", href, embed: null };
  return { provider: host.includes("vimeo") ? "vimeo" : "youtube", href, embed };
}

/** Formulário do editor (mesmo conjunto que vai para `save_feed_post`). */
export const feedPostSchema = z
  .object({
    kind: z.enum(["text", "image", "video"]),
    body: z.string().max(FEED_BODY_MAX),
    imagePath: z.string().nullable(),
    videoUrl: z.string(),
    audience: z.enum(["all", "modality", "class"]),
    modality: z.enum(["consultoria", "presencial", "hibrido"]).nullable(),
    classId: z.string().nullable(),
    pinned: z.boolean(),
    /** ISO; nulo = publicar agora. */
    publishAt: z.string().nullable(),
  })
  .superRefine((v, ctx) => {
    const body = sanitizeFeedText(v.body);
    if (v.kind === "text" && body.length === 0) ctx.addIssue({ code: "custom", path: ["body"], message: "body" });
    if (v.kind === "image" && !v.imagePath) ctx.addIssue({ code: "custom", path: ["imagePath"], message: "image" });
    if (v.kind === "video" && !classifyVideo(v.videoUrl)) ctx.addIssue({ code: "custom", path: ["videoUrl"], message: "video" });
    if (v.audience === "modality" && !v.modality) ctx.addIssue({ code: "custom", path: ["modality"], message: "modality" });
    if (v.audience === "class" && !v.classId) ctx.addIssue({ code: "custom", path: ["classId"], message: "class" });
  });
export type FeedPostForm = z.infer<typeof feedPostSchema>;

/** Payload de `save_feed_post` (texto já saneado; campos que não são do tipo escolhido vão vazios). */
export function toFeedPayload(v: FeedPostForm) {
  return {
    kind: v.kind,
    body: sanitizeFeedText(v.body),
    image_path: v.kind === "image" ? v.imagePath : null,
    video_url: v.kind === "video" ? v.videoUrl.trim() : null,
    audience: v.audience,
    audience_modality: v.audience === "modality" ? v.modality : null,
    audience_class_id: v.audience === "class" ? v.classId : null,
    pinned: v.pinned,
    published_at: v.publishAt,
  };
}

/**
 * Campo "Data e hora" do agendamento (`<input type="datetime-local">`, "aaaa-mm-ddThh:mm") lido SEMPRE no horário de
 * São Paulo (UTC−3, sem horário de verão desde 2019), qualquer que seja o fuso do aparelho. Inválido → null.
 */
export function spLocalToISO(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const d = new Date(`${local}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Inverso de `spLocalToISO` (para preencher o campo ao editar). */
export function isoToSpLocal(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 3_600_000);
  return d.toISOString().slice(0, 16);
}

/** Agendado = ainda não publicado. */
export function isScheduled(publishedAt: string, now: Date = new Date()): boolean {
  return new Date(publishedAt).getTime() > now.getTime();
}

/** Post novo para o aluno: publicado depois da última visita ao feed (primeira visita: nada é marcado). */
export function isNewForStudent(publishedAt: string, lastSeenAt: string | null): boolean {
  return lastSeenAt !== null && new Date(publishedAt).getTime() > new Date(lastSeenAt).getTime();
}

/** Caminho da imagem no bucket `feed-media`: `<org_id>/<uuid>.(jpg|webp)`. */
export function feedImagePath(orgId: string, fileId: string, mime: "image/webp" | "image/jpeg"): string {
  return `${orgId}/${fileId}.${mime === "image/webp" ? "webp" : "jpg"}`;
}

/** Dimensões depois de reduzir o lado maior para `max` (nunca aumenta). */
export function fitWithin(width: number, height: number, max = FEED_IMAGE_MAX_DIM): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Imagem enviada e ainda não usada por nenhum post: só sai depois deste prazo (o editor pode estar aberto). */
export const FEED_ORPHAN_GRACE_MS = 24 * 3_600_000;

/**
 * Limpeza diária do bucket `feed-media` (lógica pura). Remove:
 *  - imagem de post APAGADO que nenhum post ativo usa (qualquer idade);
 *  - imagem enviada há mais de 24 h que nenhum post usa (nem ativo nem apagado).
 * Nunca remove imagem de post ativo (inclusive agendado).
 */
export function pickFeedMediaToRemove(
  files: { path: string; createdAt: string | null }[],
  usage: { path: string; deleted: boolean }[],
  now: number,
): string[] {
  const active = new Set(usage.filter((u) => !u.deleted).map((u) => u.path));
  const deletedOnly = new Set(usage.filter((u) => u.deleted && !active.has(u.path)).map((u) => u.path));
  const used = new Set(usage.map((u) => u.path));
  return files
    .filter((f) => {
      if (active.has(f.path)) return false;
      if (deletedOnly.has(f.path)) return true;
      if (used.has(f.path)) return false;
      const created = f.createdAt ? new Date(f.createdAt).getTime() : NaN;
      // Sem data confiável: não arrisca.
      return Number.isFinite(created) && now - created > FEED_ORPHAN_GRACE_MS;
    })
    .map((f) => f.path);
}

// Leitura defensiva das RPCs ------------------------------------------------------------------------------------------
export interface StudentFeedPost {
  id: string;
  kind: FeedKind;
  body: string;
  imagePath: string | null;
  videoUrl: string | null;
  pinned: boolean;
  publishedAt: string;
  authorFirstName: string;
  likeCount: number;
  liked: boolean;
}
export interface StaffFeedPost extends Omit<StudentFeedPost, "liked" | "authorFirstName"> {
  audience: FeedAudience;
  audienceModality: FeedModality | null;
  audienceClassId: string | null;
  audienceClassName: string | null;
  authorName: string;
  ownStudentsOnly: boolean;
  canEdit: boolean;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
const kindOf = (v: unknown): FeedKind => (v === "image" || v === "video" ? v : "text");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0);

function basePost(o: Record<string, unknown>) {
  return {
    id: str(o.id),
    kind: kindOf(o.kind),
    body: str(o.body),
    imagePath: strOrNull(o.image_path),
    videoUrl: strOrNull(o.video_url),
    pinned: o.pinned === true,
    publishedAt: str(o.published_at),
    likeCount: num(o.like_count),
  };
}

export function parseMyFeed(raw: unknown): { lastSeenAt: string | null; posts: StudentFeedPost[] } {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(r.posts) ? r.posts : [];
  return {
    lastSeenAt: strOrNull(r.last_seen_at),
    posts: list.flatMap((p) => {
      const o = (p ?? {}) as Record<string, unknown>;
      if (typeof o.id !== "string") return [];
      return [{ ...basePost(o), authorFirstName: str(o.author_first_name), liked: o.liked === true }];
    }),
  };
}

export function parseStaffFeed(raw: unknown): StaffFeedPost[] {
  const list = Array.isArray(raw) ? raw : [];
  return list.flatMap((p) => {
    const o = (p ?? {}) as Record<string, unknown>;
    if (typeof o.id !== "string") return [];
    const audience: FeedAudience = o.audience === "modality" || o.audience === "class" ? o.audience : "all";
    const modality = o.audience_modality === "consultoria" || o.audience_modality === "presencial" || o.audience_modality === "hibrido" ? o.audience_modality : null;
    return [{
      ...basePost(o),
      audience,
      audienceModality: modality,
      audienceClassId: strOrNull(o.audience_class_id),
      audienceClassName: strOrNull(o.audience_class_name),
      authorName: str(o.author_name),
      ownStudentsOnly: o.own_students_only === true,
      canEdit: o.can_edit === true,
    }];
  });
}
