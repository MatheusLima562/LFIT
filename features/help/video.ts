import { videoEmbedUrl } from "@/lib/video";

/**
 * Vídeo de tutorial (`video_url` no frontmatter): só YouTube ou Loom, por https. Qualquer outro endereço é ignorado
 * (a página mostra só o texto). YouTube usa o embed youtube-nocookie de lib/video.ts.
 */
export type TutorialVideoProvider = "YouTube" | "Loom";

const YOUTUBE = /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//;
// loom.com/share/<id> ou loom.com/embed/<id> (id = 32 caracteres hexadecimais), com ou sem ?query.
const LOOM = /^https:\/\/(www\.)?loom\.com\/(share|embed)\/([0-9a-f]{32})(?:[/?#]|$)/;

export function tutorialVideoEmbed(value: string | null | undefined): { src: string; provider: TutorialVideoProvider } | null {
  if (!value) return null;
  if (YOUTUBE.test(value)) {
    const src = videoEmbedUrl(value);
    return src ? { src, provider: "YouTube" } : null;
  }
  const loom = LOOM.exec(value);
  return loom ? { src: `https://www.loom.com/embed/${loom[3]}`, provider: "Loom" } : null;
}
