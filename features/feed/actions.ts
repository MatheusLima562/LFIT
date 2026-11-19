"use server";

import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { dbErrorMessage } from "@/messages/pt-BR";
import { FEED_MEDIA_BUCKET } from "./media-cleanup";

/**
 * Apagar post: primeiro a RPC com a sessão do usuário autoriza (owner ou autor) e faz o soft delete; só então a secret
 * key apaga o arquivo da imagem pela API do Storage (o banco devolve o caminho só se nenhum outro post ativo o usa).
 * Se a remoção do arquivo falhar, o post continua apagado e a limpeza diária (`/api/cron/feed-media`) tenta de novo.
 */
export async function deleteFeedPost(postId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_feed_post", { p_id: postId });
  if (error) return { ok: false, error: dbErrorMessage(error) };
  const path = (data as { image_path?: unknown } | null)?.image_path;
  if (typeof path === "string" && path) {
    await createAdminClient().storage.from(FEED_MEDIA_BUCKET).remove([path]).catch(() => null);
  }
  return { ok: true };
}
