import { FEED_IMAGE_MAX_BYTES, FEED_IMAGE_MAX_DIM, fitWithin } from "./feed";

export type ResizeError = "invalid" | "too_big";

/**
 * Reduz a imagem no navegador (canvas, sem dependência): lado maior até 1600 px, WebP quando o navegador gera (senão
 * JPEG), qualidade 0,82. Remove metadados (EXIF/GPS) de quebra, porque o canvas só copia os pixels. Só roda no cliente.
 */
export async function resizeFeedImage(file: File): Promise<{ blob: Blob; mime: "image/webp" | "image/jpeg" } | { error: ResizeError }> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && file.type !== "") return { error: "invalid" };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { error: "invalid" };
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, FEED_IMAGE_MAX_DIM);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { error: "invalid" };
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.82));
  // Safari antigo devolve PNG quando não sabe gerar WebP: confere o tipo devolvido.
  let blob = await encode("image/webp");
  let mime: "image/webp" | "image/jpeg" = "image/webp";
  if (!blob || blob.type !== "image/webp") {
    blob = await encode("image/jpeg");
    mime = "image/jpeg";
  }
  if (!blob) return { error: "invalid" };
  if (blob.size > FEED_IMAGE_MAX_BYTES) return { error: "too_big" };
  return { blob, mime };
}
