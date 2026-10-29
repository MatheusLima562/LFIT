"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/db/client";
import { messages } from "@/messages/pt-BR";
import { announcementNotice, shouldToastNewMessage } from "./n1";

const t = messages.notifications;
const SEEN_KEY = "lfit:aluno:recado-visto";
const NOTIFIED_KEY = "lfit:aluno:recado-avisado";
const SEEN_EVENT = "lfit:recado-visto";

// Só ids de recado no aparelho (nada de texto nem dado do aluno). Storage falhando: sem marcador, nada quebra.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // sem storage: o aviso volta a aparecer no próximo carregamento
  }
}

/** Marca o recado como visto (tela Hoje). */
export function markAnnouncementSeen(id: string) {
  write(SEEN_KEY, id);
  window.dispatchEvent(new Event(SEEN_EVENT));
}

/** Toast "Nova mensagem no chat" quando a contagem de não lidas sobe fora da conversa (sem conteúdo nem nome). */
export function useNewMessageToast(count: number, { onChat, href }: { onChat: boolean; href: string }) {
  const router = useRouter();
  const previous = useRef(count);
  useEffect(() => {
    if (shouldToastNewMessage(previous.current, count, onChat)) {
      toast(t.newMessage, { id: "n1-chat", action: { label: t.open, onClick: () => router.push(href) } });
    }
    previous.current = count;
  }, [count, onChat, href, router]);
}

/**
 * Recado novo para o aluno: busca o id do recado atual (ao abrir e ao voltar à aba), mostra o marcador na aba Hoje até
 * ele ver o recado e avisa uma vez por recado (toast "Novo recado do seu professor", sem o texto).
 */
export function useAnnouncementNotice(onToday: boolean) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [seenId, setSeenId] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      const { data, error } = await supabase.rpc("get_my_announcement");
      if (!disposed && !error) setCurrentId((data as { id: string | null } | null)?.id ?? null);
    };
    const syncSeen = () => setSeenId(read(SEEN_KEY));
    syncSeen();
    void load();
    document.addEventListener("visibilitychange", load);
    window.addEventListener(SEEN_EVENT, syncSeen);
    window.addEventListener("storage", syncSeen);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", load);
      window.removeEventListener(SEEN_EVENT, syncSeen);
      window.removeEventListener("storage", syncSeen);
    };
  }, [supabase]);

  const notice = announcementNotice({ currentId, seenId, notifiedId: read(NOTIFIED_KEY), onToday });
  useEffect(() => {
    if (!notice.toast || !currentId) return;
    write(NOTIFIED_KEY, currentId);
    toast(t.newAnnouncement, { id: "n1-recado", action: { label: t.see, onClick: () => router.push("/aluno") } });
  }, [notice.toast, currentId, router]);

  return notice.dot;
}
