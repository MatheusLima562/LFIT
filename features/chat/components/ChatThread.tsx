"use client";

import { AlertCircle, Dumbbell, Loader2, Paperclip, SendHorizontal, WifiOff, X } from "lucide-react";
import { Fragment, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { messages as m } from "@/messages/pt-BR";
import { type Attachment, type ChatViewer, type SendResult, useChatThread } from "../hooks";
import { CHAT_MAX_LENGTH, type ChatRow, dayLabel, messageKey, staffNamesFrom, startsSenderRun, type ThreadMessage } from "../thread";

const t = m.chat;

export interface AttachGroup {
  label: string;
  items: Attachment[];
}

interface ChatThreadProps {
  studentId: string;
  viewer: ChatViewer;
  initial: ChatRow[];
  /** Fica fixo acima da lista (aviso do aluno, nome do aluno no painel). */
  header?: ReactNode;
  emptyText: string;
  /** Exercícios do plano ativo para anexar (só o aluno). */
  attachGroups?: AttachGroup[];
  /** Nome de quem enviou, para mensagens do staff vistas pelo staff (owner × professor). */
  staffNames?: Record<string, string>;
  /** Rótulo das mensagens do aluno vistas pelo staff. */
  studentLabel?: string;
  className?: string;
}

/** Conversa aluno ↔ professor: mesma tela nos dois lados. Nada aqui coloca o corpo em URL, título, toast ou console. */
export function ChatThread(props: ChatThreadProps) {
  const { studentId, viewer, initial, header, emptyText, attachGroups, staffNames, studentLabel, className } = props;
  const thread = useChatThread({ studentId, viewer, initial });
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const prevHeight = useRef<number | null>(null);

  // Rola para o fim quando chega mensagem e o usuário já estava no fim (ou acabou de enviar).
  const lastKey = thread.messages.length ? messageKey(thread.messages[thread.messages.length - 1]) : null;
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (prevHeight.current !== null) {
      // "Mensagens anteriores": mantém a posição de leitura.
      el.scrollTop += el.scrollHeight - prevHeight.current;
      prevHeight.current = null;
      return;
    }
    if (stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [lastKey, thread.messages.length]);

  const onScroll = () => {
    const el = listRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const loadOlder = () => {
    prevHeight.current = listRef.current?.scrollHeight ?? null;
    void thread.loadOlder();
  };

  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const submit = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    const sentAttachment = attachment;
    setBusy(true);
    setNotice(null);
    stickToBottom.current = true;
    setDraft("");
    setAttachment(null);
    let result: SendResult;
    try {
      result = await thread.send(body, sentAttachment);
    } catch {
      // Nada pode deixar o botão girando: qualquer falha inesperada devolve o texto ao campo.
      result = "other";
    } finally {
      setBusy(false);
    }
    if (result === "network") setNotice(t.sendFailedNetwork);
    else if (result === "rate_limited" || result === "other") {
      // Recusado pelo banco: o texto volta ao campo (enviar de novo sem editar reusa o mesmo id).
      setDraft(body);
      setAttachment(sentAttachment);
      setNotice(result === "rate_limited" ? t.rateLimited : m.auth.errors.generic);
    }
    inputRef.current?.focus();
  };

  const editFailed = (msg: ThreadMessage) => {
    thread.edit(msg);
    setDraft(msg.body);
    setAttachment(msg.attached_item_id && msg.attached_exercise_name ? { id: msg.attached_item_id, name: msg.attached_exercise_name } : null);
    setNotice(null);
    inputRef.current?.focus();
  };

  const retryFailed = async (msg: ThreadMessage) => {
    setNotice(null);
    let result: SendResult;
    try {
      result = await thread.retry(msg);
    } catch {
      result = "network";
    }
    if (result === "network") setNotice(t.sendFailedNetwork);
    else if (result !== "sent") {
      setDraft(msg.body);
      setNotice(result === "rate_limited" ? t.rateLimited : m.auth.errors.generic);
    }
  };

  const knownNames = staffNamesFrom(thread.messages);
  const senderLabel = (msg: ThreadMessage): string | null => {
    if (msg.sender_role === viewer.role && (viewer.role === "student" || msg.sender_id === viewer.staffId)) return null;
    if (msg.sender_role === "student") return studentLabel ?? null;
    if (viewer.role === "staff") return (msg.sender_id && staffNames?.[msg.sender_id]) || t.trainer;
    // Aluno: primeiro nome do professor (get_chat_messages); mensagem do Realtime usa o nome já conhecido do remetente.
    return msg.sender_first_name ?? (msg.sender_id ? knownNames.get(msg.sender_id) : undefined) ?? t.trainer;
  };
  const isMine = (msg: ThreadMessage) =>
    msg.sender_role === viewer.role && (viewer.role === "student" || msg.sender_id === viewer.staffId);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {header}
      {!thread.connected && (
        <p role="status" className="flex items-center justify-center gap-1.5 border-b border-line bg-canvas py-1 text-xs text-ink-3">
          <WifiOff aria-hidden className="size-3.5" />
          {t.reconnecting}
        </p>
      )}

      <div ref={listRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {thread.hasOlder && (
          <div className="mb-3 flex justify-center">
            <Button type="button" variant="ghost" size="sm" onClick={loadOlder} disabled={thread.loadingOlder}>
              {thread.loadingOlder ? t.loadingOlder : t.loadOlder}
            </Button>
          </div>
        )}
        {thread.messages.length === 0 && <p className="px-4 pt-10 text-center text-sm text-ink-3">{emptyText}</p>}
        <ol aria-label={t.messagesLabel} aria-live="polite" aria-relevant="additions" aria-busy={thread.loadingOlder} className="flex flex-col gap-1.5">
          {thread.messages.map((msg, i) => {
            const prev = thread.messages[i - 1];
            const day = dayLabel(msg.created_at);
            const showDay = msg.status === "sent" && (!prev || prev.status !== "sent" || dayLabel(prev.created_at) !== day);
            const mine = isMine(msg);
            const label = senderLabel(msg);
            const showLabel = label && (startsSenderRun(prev, msg) || showDay);
            return (
              <Fragment key={messageKey(msg)}>
                {showDay && (
                  <li aria-hidden className="my-2 text-center text-[11px] font-medium tracking-wide text-ink-3 uppercase">
                    {day}
                  </li>
                )}
                <li className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                  {showLabel && <span className="mb-0.5 px-1 text-[11px] font-medium text-ink-3">{label}</span>}
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-[15px] leading-snug",
                      mine ? "rounded-br-md bg-ink text-surface" : "rounded-bl-md bg-surface text-ink ring-1 ring-line",
                      msg.status === "sending" && "opacity-70",
                      msg.status === "failed" && "ring-2 ring-danger-line",
                    )}
                  >
                    {msg.attached_exercise_name && (
                      <p className={cn("mb-1 flex items-center gap-1.5 text-xs font-medium", mine ? "text-surface/80" : "text-ink-2")}>
                        <Dumbbell aria-hidden className="size-3.5 shrink-0" />
                        <span>{t.attached(msg.attached_exercise_name)}</span>
                      </p>
                    )}
                    <p className="break-words whitespace-pre-wrap">{msg.body}</p>
                  </div>
                  <span className="mt-0.5 px-1 text-[11px] text-ink-3">
                    {msg.status === "sending" ? t.sending : msg.status === "failed" ? null : formatTime(msg.created_at)}
                  </span>
                  {msg.status === "failed" && (
                    <span className="flex items-center gap-2 px-1 text-xs">
                      <span className="flex items-center gap-1 text-danger-ink">
                        <AlertCircle aria-hidden className="size-3.5" />
                        {t.failed}
                      </span>
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => void retryFailed(msg)}>
                        {t.retry}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => editFailed(msg)}>
                        {t.edit}
                      </Button>
                    </span>
                  )}
                </li>
              </Fragment>
            );
          })}
        </ol>
      </div>

      <Composer
        inputRef={inputRef}
        draft={draft}
        onDraft={setDraft}
        attachment={attachment}
        onAttachment={setAttachment}
        attachGroups={attachGroups}
        busy={busy}
        notice={notice}
        onSubmit={() => void submit()}
      />
    </div>
  );
}

function Composer({
  inputRef,
  draft,
  onDraft,
  attachment,
  onAttachment,
  attachGroups,
  busy,
  notice,
  onSubmit,
}: {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  draft: string;
  onDraft: (v: string) => void;
  attachment: Attachment | null;
  onAttachment: (a: Attachment | null) => void;
  attachGroups?: AttachGroup[];
  busy: boolean;
  notice: string | null;
  onSubmit: () => void;
}) {
  const id = useId();
  const [picking, setPicking] = useState(false);
  const empty = draft.trim() === "";

  return (
    <form
      className="border-t border-line bg-surface px-2 pt-2 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {attachment && (
        <p className="mb-2 flex w-fit max-w-full items-center gap-1.5 rounded-full bg-canvas py-1 pr-1 pl-2.5 text-xs font-medium text-ink-2 ring-1 ring-line">
          <Dumbbell aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">{t.attached(attachment.name)}</span>
          <button
            type="button"
            aria-label={t.removeAttachment}
            onClick={() => onAttachment(null)}
            className="grid size-6 shrink-0 place-items-center rounded-full outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </p>
      )}
      <div className="flex items-end gap-1.5">
        {attachGroups && (
          <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 text-ink-2" aria-label={t.attach} onClick={() => setPicking(true)}>
            <Paperclip aria-hidden />
          </Button>
        )}
        <label htmlFor={`${id}-msg`} className="sr-only">
          {t.inputLabel}
        </label>
        <Textarea
          ref={inputRef}
          id={`${id}-msg`}
          rows={1}
          maxLength={CHAT_MAX_LENGTH}
          value={draft}
          placeholder={t.placeholder}
          aria-describedby={`${id}-count`}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            // Desktop: Enter envia, Shift+Enter quebra linha. No celular, Enter é sempre quebra de linha.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
              e.preventDefault();
              onSubmit();
            }
          }}
          // 16 px no celular: abaixo disso o iOS dá zoom ao focar o campo.
          className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl text-base md:text-base"
        />
        <Button type="submit" size="icon" className="size-11 shrink-0" aria-label={busy ? t.sending : t.send} disabled={empty || busy}>
          {busy ? <Loader2 aria-hidden className="animate-spin" /> : <SendHorizontal aria-hidden />}
        </Button>
      </div>
      <div className="mt-1 flex items-start justify-between gap-2 px-1">
        <p role="status" className="min-h-4 text-xs text-ink-2">
          {notice}
        </p>
        <span id={`${id}-count`} className={cn("shrink-0 text-[11px] tabular-nums", draft.length > CHAT_MAX_LENGTH - 100 ? "text-ink-2" : "text-ink-3")}>
          {t.counter(draft.length, CHAT_MAX_LENGTH)}
        </span>
      </div>

      {attachGroups && (
        <Dialog open={picking} onOpenChange={setPicking}>
          <DialogContent className="max-h-[85dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t.attachTitle}</DialogTitle>
              <DialogDescription>{t.attachDescription}</DialogDescription>
            </DialogHeader>
            {attachGroups.length === 0 ? (
              <p className="text-sm text-ink-2">{t.attachNone}</p>
            ) : (
              attachGroups.map((g) => (
                <section key={g.label} className="flex flex-col gap-1">
                  <h3 className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{g.label}</h3>
                  <ul className="flex flex-col gap-1">
                    {g.items.map((it) => (
                      <li key={it.id}>
                        <Button
                          type="button"
                          variant={attachment?.id === it.id ? "default" : "outline"}
                          aria-pressed={attachment?.id === it.id}
                          className="h-11 w-full justify-start"
                          onClick={() => {
                            onAttachment(it);
                            setPicking(false);
                          }}
                        >
                          <Dumbbell aria-hidden />
                          <span className="truncate">{it.name}</span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </DialogContent>
        </Dialog>
      )}
    </form>
  );
}
