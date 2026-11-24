"use server";

import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { runFeedDelete } from "./delete-flow";
import { FEED_MEDIA_BUCKET } from "./media-cleanup";

/**
 * Apagar post: primeiro a RPC com a sessão do usuário autoriza (owner ou autor) e faz o soft delete; só então a secret
 * key confere o apagamento no banco e apaga o arquivo da imagem pela API do Storage (o banco devolve o caminho só se
 * nenhum outro post ativo o usa), conferindo que ele saiu do bucket. "Post apagado" só com as duas confirmações; se
 * algo falhar depois da RPC, o post volta como estava e a tela mostra erro (`runFeedDelete`).
 */
export async function deleteFeedPost(postId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  // Estado anterior (RLS da sessão) para desfazer se a imagem não sair do Storage.
  const { data: before } = await supabase.from("feed_posts").select("pinned, updated_at").eq("id", postId).is("deleted_at", null).maybeSingle();
  const admin = createAdminClient();
  const bucket = admin.storage.from(FEED_MEDIA_BUCKET);

  const r = await runFeedDelete({
    softDelete: async () => {
      const { data, error } = await supabase.rpc("delete_feed_post", { p_id: postId });
      const path = (data as { image_path?: unknown } | null)?.image_path;
      return { imagePath: typeof path === "string" && path ? path : null, error: error ?? undefined };
    },
    isDeleted: async () => {
      const { data, error } = await admin.from("feed_posts").select("deleted_at").eq("id", postId).maybeSingle();
      return !error && Boolean(data?.deleted_at);
    },
    removeFile: async (path) => ({ error: (await bucket.remove([path])).error ?? undefined }),
    fileExists: async (path) => {
      const [folder, name] = path.split("/");
      const { data, error } = await bucket.list(folder, { search: name });
      if (error) throw error;
      return (data ?? []).some((f) => f.name === name);
    },
    restore: async () => {
      const { error } = await admin.from("feed_posts")
        .update({ deleted_at: null, pinned: before?.pinned ?? false, ...(before?.updated_at ? { updated_at: before.updated_at } : {}) })
        .eq("id", postId);
      return { error: error ?? undefined };
    },
  });
  if (r.ok) return { ok: true };
  // Só a etapa (nunca o conteúdo do post) para diagnosticar.
  console.warn("[feed] apagar post falhou na etapa", r.step);
  if (r.step === "rpc") return { ok: false, error: dbErrorMessage(r.error as { message?: string } | null) };
  // Sem detalhe técnico na tela; o post continua (ou volta) publicado.
  return { ok: false, error: r.step === "storage" ? messages.feed.deleteImageFailed : messages.feed.deleteFailed };
}
