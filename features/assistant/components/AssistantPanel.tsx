"use client";

import { Bot, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/db/client";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { parseAssistantState, type AssistantState, type PanelMessage } from "../state";

const t = messages.assistant;
const CLIENT_TIMEOUT_MS = 25_000; // o servidor corta o provedor em 20 s

/**
 * Assistente de IA na tela de execução (só o aluno titular; some se a organização não ligou ou se o servidor não tem
 * provedor). Fica NO FLUXO da página, abaixo do exercício: nunca cobre "Feita" nem o próprio "Enviar", inclusive com
 * o teclado aberto a 375 px (campo de 16 px, sem posição fixa). Sempre identificado como IA. O texto nunca vai para
 * console, URL ou notificação.
 */
export function AssistantPanel({ sessionId, itemId }: { sessionId: string; itemId: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<AssistantState | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("get_ai_assistant_state", { p_session_id: sessionId });
      if (!error) setState(parseAssistantState(data));
    } catch {
      // Sem rede: o painel não aparece; nada a mostrar.
    }
  }, [supabase, sessionId]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [state?.messages.length]);

  if (!state?.enabled) return null;

  const accept = async () => {
    const { error } = await supabase.rpc("accept_ai_terms", { p_version: state.consentVersion });
    if (!error) await load();
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setNotice(null);
    const local: PanelMessage = { id: `local-${Date.now()}`, role: "student", kind: "normal", body };
    setState((s) => (s ? { ...s, messages: [...s.messages, local] } : s));
    setText("");
    try {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT_MS);
      const res = await fetch("/aluno/assistente", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, itemId, text: body }),
        signal: ctrl.signal,
      }).finally(() => window.clearTimeout(timer));
      const out = (await res.json().catch(() => ({ status: "error" }))) as { status: string };
      if (out.status === "limit") setNotice(t.status.limit);
      else if (out.status === "unavailable" || out.status === "disabled") setNotice(t.status.unavailable);
      else if (out.status === "error" || out.status === "closed") setNotice(t.status.error);
    } catch {
      setNotice(t.status.error);
    } finally {
      setSending(false);
      await load(); // fonte da verdade: o banco (resposta, pausa, restante)
    }
  };

  const pausedText = state.pausedReason === "safety" ? t.status.paused_safety : state.pausedReason === "coach_message" ? t.status.paused_coach : null;

  if (!open) {
    return (
      <Button type="button" variant="outline" className="h-11 w-full justify-start gap-2" onClick={() => setOpen(true)}>
        <Bot aria-hidden />
        {t.open}
      </Button>
    );
  }

  return (
    <section aria-labelledby="assistant-title" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <header className="flex items-start justify-between gap-2">
        <h2 id="assistant-title" className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <Bot aria-hidden className="size-4" />
          {t.title}
          <span className="rounded-full bg-canvas px-1.5 py-0.5 text-[11px] font-semibold text-ink-2 ring-1 ring-line">{t.badge}</span>
        </h2>
        <button
          type="button"
          aria-label={t.close}
          onClick={() => setOpen(false)}
          className="-m-1.5 grid size-9 shrink-0 place-items-center rounded-lg text-ink-3 outline-none hover:bg-canvas focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X aria-hidden className="size-4" />
        </button>
      </header>
      <p className="text-xs text-ink-3">{t.disclaimer}</p>

      {state.consentRequired ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-[13px] font-semibold text-ink">{t.termsTitle}</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink-2">
            {t.termsBody.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <Button type="button" onClick={() => void accept()}>
            {t.termsAccept}
          </Button>
        </div>
      ) : (
        <>
          {state.messages.length > 0 && (
            <ol ref={listRef} aria-live="polite" className="flex max-h-72 flex-col gap-2 overflow-y-auto">
              {state.messages.map((m) => (
                <li
                  key={m.id}
                  className={cn(
                    "max-w-[90%] rounded-xl px-3 py-2 text-[14px] whitespace-pre-line",
                    m.role === "student" ? "self-end bg-canvas text-ink" : "self-start border border-line text-ink",
                    m.kind === "safety" && "border-warning-line bg-warning-soft text-warning-ink",
                  )}
                >
                  <span className="mb-0.5 block text-[11px] font-semibold text-ink-3">{m.role === "student" ? t.you : t.title}</span>
                  {m.body}
                </li>
              ))}
            </ol>
          )}
          {pausedText ? (
            <p role="status" className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-[13px] text-warning-ink">
              {pausedText}
            </p>
          ) : (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <label htmlFor="assistant-input" className="sr-only">
                {t.placeholder}
              </label>
              <textarea
                id="assistant-input"
                rows={2}
                maxLength={state.maxInputChars}
                value={text}
                placeholder={t.placeholder}
                onChange={(e) => setText(e.target.value)}
                className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-[16px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-ink-3">{t.remaining(state.remainingToday)}</span>
                <Button type="submit" disabled={sending || !text.trim() || state.remainingToday <= 0}>
                  {sending && <Loader2 aria-hidden className="animate-spin" />}
                  {sending ? t.sending : t.send}
                </Button>
              </div>
            </form>
          )}
          {notice && (
            <p role="alert" className="text-[13px] text-ink-2">
              {notice}
            </p>
          )}
        </>
      )}
    </section>
  );
}
