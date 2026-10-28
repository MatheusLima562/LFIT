"use client";

import { ChevronDown, Clock, ShieldAlert } from "lucide-react";
import { useId, useSyncExternalStore } from "react";
import { TrainerAvatar } from "@/features/student-app/components/TrainerAvatar";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";

const t = messages.chat;
const KEY = "lfit:aluno:aviso-chat-recolhido";
const EVENT = "lfit:aviso-chat";

// Primeiro acesso neste aparelho (sem preferência gravada): o aviso fica aberto até recarregar, e a partir do próximo
// acesso começa recolhido. Decidido uma vez por carregamento da página.
let firstVisitOpen: boolean | null = null;

// Preferência só deste aparelho (conveniência; só "1"/"0", nada do aluno): falha de storage = aviso aberto, o lado seguro.
function readCollapsed() {
  try {
    if (firstVisitOpen === null) {
      firstVisitOpen = localStorage.getItem(KEY) === null;
      if (firstVisitOpen) localStorage.setItem(KEY, "1");
    }
    if (firstVisitOpen) return false;
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
function setCollapsed(value: boolean) {
  firstVisitOpen = false;
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    // sem storage: o aviso volta aberto (leitura falha = aberto)
  }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Topo da conversa do aluno, compacto (uma linha, até 56 px): com quem ele fala e o horário de atendimento. Abaixo, o
 * aviso de emergência: aberto no primeiro acesso; depois recolhido em uma linha que mantém "Não é canal de emergência ·
 * ligue 192" sempre visível. Os dois ficam no fluxo (nunca sobre a lista de mensagens).
 */
export function StudentChatHeader({ trainerName, officeHours }: { trainerName: string | null; officeHours: string | null }) {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  const id = useId();

  return (
    <div className="flex shrink-0 flex-col gap-1 border-b border-line px-4 pb-1.5">
      <div className="flex h-11 items-center gap-2.5">
        <TrainerAvatar name={trainerName ?? t.studioTeam} className="size-8 text-xs" />
        <p className="sr-only">{trainerName ? t.yourTrainer : t.title}</p>
        <h1 className="max-w-[60%] shrink-0 truncate text-[15px] font-semibold text-ink">{trainerName ?? t.studioTeam}</h1>
        {officeHours && (
          <p className="flex min-w-0 flex-1 items-center gap-1 text-xs text-ink-3">
            <Clock aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">{t.officeHours(officeHours)}</span>
          </p>
        )}
      </div>

      <div className="rounded-xl bg-warning-soft text-[13px] ring-1 ring-warning-line">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={id}
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "flex min-h-11 w-full gap-2 rounded-xl px-3 text-left font-medium text-warning-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            collapsed ? "items-center py-1.5" : "items-start py-2.5",
          )}
        >
          <ShieldAlert aria-hidden className={cn("size-4 shrink-0", !collapsed && "mt-0.5")} />
          <span className={cn("flex-1", collapsed && "truncate")}>{collapsed ? t.emergencyShort : t.emergency}</span>
          <ChevronDown aria-hidden className={cn("size-4 shrink-0 transition-transform", !collapsed && "mt-0.5 rotate-180")} />
          <span className="sr-only">{collapsed ? t.noticeMore : t.noticeLess}</span>
        </button>
        <div id={id} hidden={collapsed} className="px-3 pb-2.5 pl-9 text-ink-2">
          {t.visibility}
        </div>
      </div>
    </div>
  );
}
