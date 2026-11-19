import "server-only";
import { createClient } from "@/lib/db/server";
import { parseMyFeed, parseStaffFeed, type StaffFeedPost, type StudentFeedPost } from "./feed";

export const FEED_MEDIA_BUCKET = "feed-media";
/** URL assinada curta: a imagem de post apagado/agendado deixa de abrir em até 1 h. */
const FEED_IMAGE_TTL = 60 * 60;

/**
 * Assina as imagens COM A SESSÃO DO USUÁRIO (o RLS do Storage decide: staff da org ou aluno que vê o post). Sem cache
 * compartilhado: diferente dos vídeos de exercício, o público do post pode mudar e o post pode ser apagado.
 */
async function signImages<T extends { imagePath: string | null }>(posts: T[]): Promise<(T & { imageUrl: string | null })[]> {
  const paths = [...new Set(posts.map((p) => p.imagePath).filter((p): p is string => !!p))];
  const urls = new Map<string, string>();
  if (paths.length) {
    const supabase = await createClient();
    const { data } = await supabase.storage.from(FEED_MEDIA_BUCKET).createSignedUrls(paths, FEED_IMAGE_TTL);
    for (const row of data ?? []) if (row.path && row.signedUrl && !row.error) urls.set(row.path, row.signedUrl);
  }
  return posts.map((p) => ({ ...p, imageUrl: p.imagePath ? urls.get(p.imagePath) ?? null : null }));
}

export type StaffFeedItem = StaffFeedPost & { imageUrl: string | null };
export type StudentFeedItem = StudentFeedPost & { imageUrl: string | null };

/** Página "Feed" do painel: posts da organização (inclusive agendados), com a contagem de curtidas. */
export async function listStaffFeed(): Promise<StaffFeedItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_feed_posts");
  if (error) throw new Error("FEED_LOAD_FAILED");
  return signImages(parseStaffFeed(data));
}

/** Turmas da organização para o público do post (RLS de `classes`). */
export async function listFeedClasses(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("classes").select("id, name").order("name");
  return data ?? [];
}

/** Feed do aluno logado (RPC aplica público, agendamento e exclusão). */
export async function getMyFeed(): Promise<{ lastSeenAt: string | null; posts: StudentFeedItem[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_feed");
  // A página roda em paralelo ao layout: recusa de acesso não derruba a página (o layout mostra o portão).
  if (error?.message === "ACCESS_SUSPENDED" || error?.message === "STUDENT_NOT_FOUND") return { lastSeenAt: null, posts: [] };
  if (error) throw new Error("FEED_LOAD_FAILED");
  const feed = parseMyFeed(data);
  return { lastSeenAt: feed.lastSeenAt, posts: await signImages(feed.posts) };
}

/** Hoje do aluno: post fixado mais recente que ele vê (null se não houver ou se a RPC recusar). */
export async function getMyPinnedPost(): Promise<{ id: string; kind: "text" | "image" | "video"; body: string; authorFirstName: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_pinned_post");
  if (error || !data) return null;
  const r = data as { id?: string; kind?: string; body?: string; author_first_name?: string };
  if (typeof r.id !== "string") return null;
  const kind = r.kind === "image" || r.kind === "video" ? r.kind : "text";
  return { id: r.id, kind, body: r.body ?? "", authorFirstName: r.author_first_name ?? "" };
}

/** Quantos posts novos desde a última visita (marcador da aba). Falha = 0 (o marcador é só um aviso). */
export async function getMyFeedNewCount(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_feed_new_count");
  return error || typeof data !== "number" ? 0 : data;
}
