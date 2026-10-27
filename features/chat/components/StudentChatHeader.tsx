"use client";

import { ChevronDown, Clock, ShieldAlert } from "lucide-react";
import { useId, useSyncExternalStore } from "react";
import { TrainerAvatar } from "@/features/student-app/components/TrainerAvatar";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";

const t = messages.chat;
const KEY = "lfit:aluno:aviso-chat-recolhido";
const EVENT = "lfit:aviso-chat";

// Preferência só deste aparelho (conveniência): falha de storage = aviso aberto, o lado seguro.
function readCollapsed() {
  try {
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
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    // sem storage: vale só até recarregar
  }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Topo da conversa do aluno: com quem ele fala (professor responsável ou equipe do estúdio) e o aviso de emergência.
 * O aviso recolhe para uma linha, mas a frase "Não é canal de emergência: ligue 192" fica sempre visível.
 */
export function StudentChatHeader({ trainerName, officeHours }: { trainerName: string | null; officeHours: string | null }) {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  const id = useId();

  return (
    <div className="mx-4 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <TrainerAvatar name={trainerName ?? t.studioTeam} className="size-10" />
        <div className="min-w-0">
          <p className="text-xs text-ink-3">{trainerName ? t.yourTrainer : t.title}</p>
          <h1 className="truncate text-[15px] font-semibold text-ink">{trainerName ?? t.studioTeam}</h1>
          {officeHours && (
            <p className="flex items-center gap-1 text-xs text-ink-2">
              <Clock aria-hidden className="size-3.5 shrink-0 text-ink-3" />
              <span className="truncate">{t.officeHours(officeHours)}</span>
            </p>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-warning-soft text-[13px] ring-1 ring-warning-line">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={id}
          onClick={() => setCollapsed(!collapsed)}
          className="flex min-h-11 w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left font-medium text-warning-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">{collapsed ? t.emergencyShort : t.emergency}</span>
          <ChevronDown aria-hidden className={cn("mt-0.5 size-4 shrink-0 transition-transform", !collapsed && "rotate-180")} />
          <span className="sr-only">{collapsed ? t.noticeMore : t.noticeLess}</span>
        </button>
        <div id={id} hidden={collapsed} className="px-3 pb-2.5 pl-9 text-ink-2">
          {t.visibility}
        </div>
      </div>
    </div>
  );
}
