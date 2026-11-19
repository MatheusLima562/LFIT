import { Bot } from "lucide-react";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import type { AssistantConversation } from "../queries";

const t = messages.assistant;

/** Histórico das conversas com o Assistente de IA para o professor (só chega aqui quem vê a saúde do aluno). */
export function AssistantHistory({ conversations }: { conversations: AssistantConversation[] }) {
  return (
    <section aria-labelledby="assistant-history" className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <h2 id="assistant-history" className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        <Bot aria-hidden className="size-4 text-ink-3" />
        {t.history.title}
      </h2>
      <div className="mt-3 flex flex-col gap-4">
        {conversations.map((c) => (
          <details key={c.sessionId} className="rounded-xl border border-line px-3 py-2">
            <summary className="cursor-pointer text-[13px] font-medium text-ink">
              {t.history.session(c.workoutLabel, formatDate(c.startedAt))}
            </summary>
            <ol className="mt-2 flex flex-col gap-1.5">
              {c.messages.map((m) => (
                <li key={m.id} className={cn("rounded-lg px-2.5 py-1.5 text-[13px] whitespace-pre-line", m.role === "student" ? "bg-canvas" : "border border-line")}>
                  <span className="block text-[11px] font-semibold text-ink-3">
                    {m.role === "student" ? t.history.student : t.title}
                    {m.kind === "safety" && ` · ${t.history.safety}`}
                    {m.kind === "fallback" && ` · ${t.history.fallback}`}
                  </span>
                  {m.body}
                </li>
              ))}
            </ol>
          </details>
        ))}
      </div>
    </section>
  );
}
