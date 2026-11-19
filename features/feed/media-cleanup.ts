import type { SupabaseClient } from "@supabase/supabase-js";
import { pickFeedMediaToRemove } from "./feed";

export const FEED_MEDIA_BUCKET = "feed-media";
const PAGE = 1000;

/**
 * Limpeza do bucket `feed-media` pela API do Storage (nada de SQL em `storage.objects`). Recebe um cliente com a
 * secret key (só servidor: rota do cron e testes de banco). Lista `<org>/<arquivo>` de cada organização, cruza com
 * `feed_posts.image_path` e remove o que `pickFeedMediaToRemove` escolher. `orgIds` restringe a algumas pastas (testes).
 * Devolve só contagens (nunca caminhos ou conteúdo no log).
 */
export async function purgeFeedMedia(
  admin: SupabaseClient,
  { now = Date.now(), orgIds }: { now?: number; orgIds?: string[] } = {},
): Promise<{ scanned: number; removed: number }> {
  const bucket = admin.storage.from(FEED_MEDIA_BUCKET);
  let folders = orgIds;
  if (!folders) {
    const { data, error } = await bucket.list("", { limit: PAGE });
    if (error) throw new Error("FEED_MEDIA_LIST_FAILED");
    // Pastas vêm sem `id` (não são objetos).
    folders = (data ?? []).filter((e) => e.id === null).map((e) => e.name);
  }

  let scanned = 0;
  let removed = 0;
  for (const org of folders) {
    const files: { path: string; createdAt: string | null }[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await bucket.list(org, { limit: PAGE, offset });
      if (error) throw new Error("FEED_MEDIA_LIST_FAILED");
      const page = (data ?? []).filter((e) => e.id !== null);
      files.push(...page.map((e) => ({ path: `${org}/${e.name}`, createdAt: e.created_at ?? null })));
      if ((data ?? []).length < PAGE) break;
    }
    scanned += files.length;
    if (!files.length) continue;

    const usage: { path: string; deleted: boolean }[] = [];
    for (let i = 0; i < files.length; i += 200) {
      const chunk = files.slice(i, i + 200).map((f) => f.path);
      const { data, error } = await admin.from("feed_posts").select("image_path, deleted_at").in("image_path", chunk);
      if (error) throw new Error("FEED_POSTS_READ_FAILED");
      for (const r of data ?? []) if (r.image_path) usage.push({ path: r.image_path, deleted: r.deleted_at !== null });
    }

    const toRemove = pickFeedMediaToRemove(files, usage, now);
    for (let i = 0; i < toRemove.length; i += 100) {
      const { data, error } = await bucket.remove(toRemove.slice(i, i + 100));
      if (error) throw new Error("FEED_MEDIA_REMOVE_FAILED");
      removed += (data ?? []).length;
    }
  }
  return { scanned, removed };
}
