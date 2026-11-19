import type { RealtimeChannel } from "@supabase/supabase-js";
import type { createClient } from "@/lib/db/client";

type BrowserClient = ReturnType<typeof createClient>;

/**
 * Entra num canal do Realtime só depois de o cliente ter o token do usuário. Logo após carregar a página, o cliente do
 * navegador ainda não leu a sessão e o canal entrava como `anon`: o Realtime recusava a assinatura filtrada ("invalid
 * column for filter student_id" — `anon` não tem grant em `chat_messages`) e a sem filtro não recebia nada pelo RLS,
 * sem erro na tela. `setAuth()` sem argumento usa o `accessToken` do supabase-js (a sessão atual). Devolve a limpeza.
 */
export function joinWithAuth(supabase: BrowserClient, open: () => RealtimeChannel): () => void {
  let disposed = false;
  let channel: RealtimeChannel | null = null;
  void supabase.realtime
    .setAuth()
    .catch(() => {})
    .finally(() => {
      if (!disposed) channel = open();
    });
  return () => {
    disposed = true;
    if (channel) void supabase.removeChannel(channel);
  };
}
