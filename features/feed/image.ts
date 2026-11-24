import { resizeImage, type ResizeError } from "@/lib/image-resize";
import { FEED_IMAGE_MAX_BYTES, FEED_IMAGE_MAX_DIM } from "./feed";

export type { ResizeError };

/** Imagem do feed: lado maior até 1600 px, até 5 MB, WebP/JPEG sem metadados (ver `lib/image-resize.ts`). */
export function resizeFeedImage(file: File) {
  return resizeImage(file, { maxDim: FEED_IMAGE_MAX_DIM, maxBytes: FEED_IMAGE_MAX_BYTES });
}
