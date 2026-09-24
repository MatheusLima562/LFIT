import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/db/admin";

export const EXERCISE_MEDIA_BUCKET = "exercise-media";
/** Validade das URLs assinadas de vídeo (7 dias). */
const SIGNED_URL_TTL = 7 * 24 * 60 * 60;
/** Reemite antes de vencer: a URL em cache sempre tem ≥ 1 dia de validade. */
const CACHE_REVALIDATE = 6 * 24 * 60 * 60;

/**
 * URL assinada reaproveitada entre acessos (mesma URL → o navegador usa o cache em vez de baixar de novo).
 *
 * SEGURANÇA: só chame com um caminho lido de uma linha que o usuário acessou pelo RLS
 * (ex.: exercises.video_path). A assinatura usa a service_role justamente para poder ser
 * compartilhada no cache; quem autoriza é a leitura da linha, feita antes com a sessão do usuário.
 * Revogação: uma URL já emitida vale até expirar (≤ 7 dias).
 */
const signCached = unstable_cache(
  async (path: string): Promise<string | null> => {
    const { data } = await createAdminClient().storage.from(EXERCISE_MEDIA_BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
    return data?.signedUrl ?? null;
  },
  ["exercise-media-signed-url"],
  { revalidate: CACHE_REVALIDATE },
);

export async function exerciseMediaUrl(path: string | null) {
  return path ? signCached(path) : null;
}
