import { describe, expect, it } from "vitest";
import { isSupportedVideoUrl, videoEmbedUrl } from "@/lib/video";

describe("videoEmbedUrl", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?t=10", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://m.youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://vimeo.com/76979871", "https://player.vimeo.com/video/76979871?dnt=1"],
    ["https://player.vimeo.com/video/76979871", "https://player.vimeo.com/video/76979871?dnt=1"],
  ])("%s", (input, expected) => {
    expect(videoEmbedUrl(input)).toBe(expected);
  });

  it.each([
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=curto",
    "https://www.youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
    "javascript:alert(1)",
    "https://vimeo.com/sobre",
  ])("recusa %s", (input) => {
    expect(isSupportedVideoUrl(input)).toBe(false);
  });
});

describe("vídeo enviado: tipo e extensão", async () => {
  const { checkVideoType } = await import("@/features/exercises/video");
  const { formatBytes } = await import("@/lib/format");
  it.each([
    [{ name: "agacho.mp4", type: "video/mp4", size: 1000 }, true],
    [{ name: "AGACHO.WEBM", type: "video/webm", size: 1000 }, true],
    [{ name: "agacho.mov", type: "video/quicktime", size: 1000 }, false],
    [{ name: "agacho.mp4", type: "video/quicktime", size: 1000 }, false],
    [{ name: "agacho.webm", type: "video/mp4", size: 1000 }, true],
    [{ name: "agacho.txt", type: "video/mp4", size: 1000 }, false],
    [{ name: "enorme.mp4", type: "video/mp4", size: 300 * 1024 * 1024 }, false],
  ])("%o → %s", (file, ok) => {
    expect(checkVideoType(file).ok).toBe(ok);
  });
  it("mensagem de tamanho explica como reduzir", () => {
    const r = checkVideoType({ name: "enorme.mp4", type: "video/mp4", size: 300 * 1024 * 1024 });
    expect(!r.ok && r.error).toMatch(/720p, sem áudio/);
  });
  it("formatBytes", () => {
    expect([formatBytes(0), formatBytes(12.34 * 1024 * 1024), formatBytes(500 * 1024 * 1024), formatBytes(2048 * 1024 * 1024)]).toEqual(["0 MB", "12,3 MB", "500 MB", "2 GB"]);
  });
});
