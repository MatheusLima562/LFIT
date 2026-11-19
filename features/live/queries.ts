import "server-only";
import { createClient } from "@/lib/db/server";
import { parseLiveBoard, type LiveBoard } from "./live";

/** Painel ao vivo do chamador (RLS + checagem na RPC). Falhou → null: o card some em vez de mostrar outra coisa. */
export async function getLiveBoard(): Promise<LiveBoard | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_live_board");
  if (error) return null;
  return parseLiveBoard(data);
}
