export type ResizeError = "invalid" | "too_big";

/** Dimensões depois de reduzir o lado maior para `max` (nunca aumenta). */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Reduz uma imagem no navegador (canvas, sem dependência): lado maior até `maxDim`, WebP quando o navegador gera (senão
 * JPEG), qualidade 0,82. Remove metadados (EXIF/GPS) de quebra — o canvas só copia os pixels. Só roda no cliente.
 */
export async function resizeImage(
  file: File,
  { maxDim, maxBytes }: { maxDim: number; maxBytes: number },
): Promise<{ blob: Blob; mime: "image/webp" | "image/jpeg" } | { error: ResizeError }> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && file.type !== "") return { error: "invalid" };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { error: "invalid" };
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxDim);
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
  if (blob.size > maxBytes) return { error: "too_big" };
  return { blob, mime };
}
