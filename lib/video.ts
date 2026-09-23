/**
 * Vídeos de exercício: só YouTube e Vimeo (https), mesma regra do CHECK em
 * public.exercises.video_url. O embed usa youtube-nocookie e só é carregado
 * quando o usuário clica.
 */
const ALLOWED = /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)\//;

export function isSupportedVideoUrl(value: string) {
  return ALLOWED.test(value) && videoEmbedUrl(value) !== null;
}

export function videoEmbedUrl(value: string): string | null {
  if (!ALLOWED.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, "");
  const id11 = /^[A-Za-z0-9_-]{11}$/;

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return id11.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "youtube.com") {
    const [, first, second] = url.pathname.split("/");
    const id = first === "watch" ? url.searchParams.get("v") : ["shorts", "embed", "live"].includes(first) ? second : null;
    return id && id11.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  // vimeo.com/123456 · vimeo.com/channels/x/123456 · player.vimeo.com/video/123456
  const id = url.pathname.split("/").filter(Boolean).reverse().find((p) => /^\d{5,12}$/.test(p));
  return id ? `https://player.vimeo.com/video/${id}?dnt=1` : null;
}
