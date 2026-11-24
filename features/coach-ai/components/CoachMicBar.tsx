"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Dumbbell, Home, MessageCircle, Mic, Users } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { describeChange, type Change } from "@/features/prescription/prescription";
import { callAction } from "@/lib/action";
import { createClient } from "@/lib/db/client";
import { cn } from "@/lib/utils";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { runCentralCoachCommand } from "../actions";
import type { ProposalRow } from "../coach-ai";
import type { CoachStatus } from "../queries";

const t = messages.coachAi;

/** Reconhecimento de voz do navegador (Web Speech API; no iPhone, o do Safari). Tipagem mínima — não está no lib.dom. */
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;
function getRecognition(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const STUDENT_PATH = /^\/alunos\/([0-9a-f-]{36})(\/|$)/;

const NAV = [
  { href: "/", label: "Início", icon: Home },
  { href: "/alunos", label: "Alunos", icon: Users },
  null,
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/treinos", label: "Treinos", icon: Dumbbell },
] as const;

/**
 * Barra inferior do painel no CELULAR com o microfone grande no centro (complemento da PARTE B). Só existe com a IA do
 * personal ligada na conta e plano Pro/Gold (sem isso o painel fica como sempre). Voz: reconhecimento do navegador em
 * pt-BR; sem suporte ou com erro, campo de texto com o ditado do teclado. Áudio nunca é gravado nem enviado ao app.
 * Com um aluno aberto (/alunos/[id]…), o comando vale para ele; senão o servidor acha o aluno pelo nome.
 */
export function CoachMicBar({ status }: { status: CoachStatus }) {
  const id = useId();
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const openStudentId = STUDENT_PATH.exec(pathname)?.[1] ?? null;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(status.remaining);
  const [question, setQuestion] = useState<string | null>(null);
  const [choose, setChoose] = useState<{ id: string; name: string }[] | null>(null);
  const [proposal, setProposal] = useState<{ changes: Change[]; rows: ProposalRow[]; studentName?: string } | null>(null);
  const [pending, start] = useTransition();
  const [applying, setApplying] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => { setQuestion(null); setChoose(null); setProposal(null); setNote(null); };
  const fallback = (msg: string) => { setListening(false); setNote(msg); setTimeout(() => inputRef.current?.focus(), 50); };

  const listen = () => {
    reset();
    setOpen(true);
    const Ctor = getRecognition();
    if (!Ctor) return fallback(t.mic.fallback);
    try {
      const r = new Ctor();
      r.lang = "pt-BR";
      r.interimResults = true;
      r.continuous = false;
      r.onresult = (e) => setText(Array.from(e.results).map((x) => x[0]?.transcript ?? "").join(" ").trim());
      r.onerror = () => fallback(t.mic.voiceError);
      r.onend = () => setListening(false);
      rec.current = r;
      setListening(true);
      r.start();
    } catch {
      fallback(t.mic.voiceError);
    }
  };

  useEffect(() => () => rec.current?.abort(), []);

  const send = (studentId: string | null) => {
    if (!text.trim()) return;
    rec.current?.stop();
    reset();
    start(async () => {
      const r = await callAction(() => runCentralCoachCommand(text, studentId));
      if (!r) return;
      if (r.status === "error") return void toast.error(r.message);
      if (r.status === "info") return void setNote(r.message);
      if (r.status === "choose") return void setChoose(r.options);
      setRemaining(r.remaining);
      if (r.status === "question") setQuestion(r.question);
      else setProposal({ changes: r.changes, rows: r.rows, studentName: r.studentName });
    });
  };

  const apply = async () => {
    if (!proposal) return;
    setApplying(true);
    try {
      const { data, error } = await supabase.rpc("apply_prescription_changes", { p_changes: proposal.changes, p_source: "ai" });
      if (error) {
        toast.error(dbErrorMessage(error));
        setProposal(null);
        return;
      }
      const batch = (data as { batch_id?: string } | null)?.batch_id;
      toast.success(t.applied, batch ? {
        action: {
          label: messages.prescription.undo,
          onClick: async () => {
            const u = await supabase.rpc("undo_prescription_batch", { p_batch_id: batch });
            if (u.error) toast.error(dbErrorMessage(u.error));
            else toast.success(messages.prescription.history.undoneToast);
            router.refresh();
          },
        },
      } : undefined);
      setProposal(null);
      setText("");
      setOpen(false);
      router.refresh();
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <nav aria-label={t.mic.title} data-testid="coach-mic-bar"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="mx-auto grid h-16 max-w-md grid-cols-5 items-center">
          {NAV.map((n, k) =>
            n === null ? (
              <li key="mic" className="flex justify-center">
                <button type="button" onClick={listen} aria-label={t.mic.open}
                  className="-mt-7 grid size-16 place-items-center rounded-full bg-brand-600 text-white shadow-lg ring-4 ring-surface outline-none focus-visible:ring-ring active:scale-95">
                  <Mic aria-hidden className="size-7" />
                </button>
              </li>
            ) : (
              <li key={k}>
                <Link href={n.href} aria-current={(n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)) ? "page" : undefined}
                  className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium outline-none focus-visible:bg-canvas",
                    (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)) ? "text-ink" : "text-ink-3")}>
                  <n.icon aria-hidden className="size-5" />
                  {n.label}
                </Link>
              </li>
            ),
          )}
        </ul>
      </nav>

      <Sheet open={open} onOpenChange={(o) => { if (!o) rec.current?.abort(); setOpen(o); }}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-3 overflow-y-auto rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <SheetTitle>{t.mic.title}</SheetTitle>
          <SheetDescription className="text-xs">{t.mic.privacy}</SheetDescription>

          {listening && (
            <div role="status" className="flex items-center justify-between gap-3 rounded-xl bg-canvas p-3 ring-1 ring-line">
              <p className="text-sm text-ink">{t.mic.listening}</p>
              <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => rec.current?.stop()}>{t.mic.stop}</Button>
            </div>
          )}
          {note && <p role="status" className="rounded-xl bg-info-soft p-3 text-sm text-info-ink ring-1 ring-info-line">{note}</p>}

          <form onSubmit={(e) => { e.preventDefault(); send(openStudentId); }} className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-txt`} className="text-sm font-medium text-ink">{t.mic.label}</label>
            <div className="flex gap-2">
              <Input id={`${id}-txt`} ref={inputRef} className="h-11" value={text} maxLength={status.maxChars} autoComplete="off" enterKeyHint="send"
                onChange={(e) => setText(e.target.value)} disabled={pending} />
              <Button type="submit" className="h-11 shrink-0" disabled={pending || !text.trim() || remaining <= 0}>{pending ? t.mic.sending : t.mic.send}</Button>
            </div>
            <p className="text-xs text-ink-3">{t.remaining(remaining, status.dailyLimit)}</p>
          </form>

          {choose && (
            <div className="flex flex-col gap-2" data-testid="coach-choose">
              <p className="text-sm font-medium text-ink">{t.mic.choose}</p>
              {choose.map((o) => (
                <Button key={o.id} type="button" variant="outline" className="h-11 justify-start" disabled={pending} onClick={() => send(o.id)}>{o.name}</Button>
              ))}
            </div>
          )}
          {question && (
            <div role="status" className="rounded-xl bg-info-soft p-3 text-sm text-info-ink ring-1 ring-info-line">
              <p className="font-medium">{t.question}</p>
              <p>{question}</p>
            </div>
          )}
          {proposal && (
            <div className="flex flex-col gap-2" data-testid="coach-proposal">
              <p className="text-sm font-medium text-ink">{t.proposalTitle}</p>
              {proposal.studentName && <p className="text-sm text-ink">{t.mic.forStudent(proposal.studentName)}</p>}
              <ul className="flex flex-col gap-1 rounded-xl bg-canvas p-3 text-sm ring-1 ring-line">
                {proposal.rows.map((r, k) => (
                  <li key={k}>
                    <span className="font-medium text-ink">{r.workoutLabel} · {r.exercise}</span>: {describeChange({ field: r.field, old: r.before, new: r.after, unit: r.unit })}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Button type="button" className="h-11" disabled={applying} onClick={() => void apply()}>{t.confirm}</Button>
                <Button type="button" variant="outline" className="h-11" disabled={applying} onClick={() => setProposal(null)}>{t.discard}</Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
