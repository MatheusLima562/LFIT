"use client";

import { Copy, MessageCircle } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { callAction } from "@/lib/action";
import { formatDate } from "@/lib/format";
import { whatsappUrl } from "@/features/platform/platform";
import { messages } from "@/messages/pt-BR";
import { createInvites } from "../invite-actions";
import { fillInviteMessage } from "../invites";
import type { InvitableStudent } from "../invite-queries";

const t = messages.invites;

/**
 * Convidar alunos (um ou vários): gera links de uso único (7 dias) e mostra, por aluno, "Copiar link" e "Abrir no
 * WhatsApp" com a mensagem editável. O link só existe nesta tela (o banco guarda o hash).
 */
export function InviteManager({ students, preselected, template, quota }: {
  students: InvitableStudent[];
  preselected: string | null;
  template: string;
  quota: { limit: number; remaining: number };
}) {
  const id = useId();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(preselected ? [preselected] : []));
  const [text, setText] = useState(template);
  const [links, setLinks] = useState<Map<string, { url: string; expiresAt: string }>>(new Map());
  const [left, setLeft] = useState(quota.remaining);
  const [pending, start] = useTransition();

  const toggle = (sid: string) => setSelected((s) => { const n = new Set(s); if (n.has(sid)) n.delete(sid); else n.add(sid); return n; });
  const allSelected = students.length > 0 && students.every((s) => selected.has(s.id));

  const generate = () =>
    start(async () => {
      const r = await callAction(() => createInvites([...selected]));
      if (!r) return;
      if (!r.ok) return void toast.error(r.error);
      setLinks((m) => { const n = new Map(m); for (const i of r.items) n.set(i.studentId, { url: i.url, expiresAt: i.expiresAt }); return n; });
      setLeft((l) => Math.max(0, l - r.items.length));
      setSelected(new Set());
      toast.success(t.generated(r.items.length));
    });

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t.copied);
    } catch {
      toast.message(t.copyFailed, { description: url, duration: 30_000 });
    }
  };

  if (students.length === 0) return <p className="rounded-2xl bg-surface p-5 text-sm text-ink-2 ring-1 ring-line">{t.empty}</p>;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-2xl bg-surface p-4 ring-1 ring-line">
        <label id={`${id}-msg`} htmlFor={`${id}-txt`} className="text-sm font-medium text-ink">{t.message}</label>
        <Textarea id={`${id}-txt`} rows={3} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} className="text-base md:text-sm" />
        <p className="text-xs text-ink-3">{t.messageHint}</p>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(students.map((s) => s.id)))} className="size-4 accent-[var(--color-control)]" />
          {t.selectAll}
        </label>
        <span className="text-xs text-ink-3" aria-live="polite">{t.quota(left, quota.limit)} · {t.selected(selected.size)}</span>
        <Button type="button" disabled={pending || selected.size === 0} onClick={generate}>
          {pending ? t.generating : t.generate(selected.size)}
        </Button>
      </div>

      <ul className="divide-y divide-line rounded-2xl bg-surface ring-1 ring-line" aria-label={t.title}>
        {students.map((s) => {
          const link = links.get(s.id);
          const msg = link ? fillInviteMessage(text, { nome: s.firstName, link: link.url }) : "";
          return (
            <li key={s.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex min-w-0 items-center gap-3 text-sm text-ink">
                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} aria-label={s.fullName} className="size-4 shrink-0 accent-[var(--color-control)]" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{s.fullName}</span>
                  <span className="block text-xs text-ink-3">
                    {link ? t.expires(formatDate(link.expiresAt)) : t.status[s.status]}
                    {s.status === "sent" && s.expiresAt && !link ? ` · ${t.expires(formatDate(s.expiresAt))}` : ""}
                  </span>
                </span>
              </label>
              {link && (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => void copy(link.url)}>
                    <Copy aria-hidden />
                    {t.copy}
                  </Button>
                  {s.whatsapp ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={whatsappUrl(msg, s.whatsapp)} target="_blank" rel="noopener noreferrer" aria-label={`${t.whatsapp}: ${s.fullName}`}>
                        <MessageCircle aria-hidden />
                        {t.whatsapp}
                      </a>
                    </Button>
                  ) : (
                    <span className="self-center text-xs text-ink-3">{t.noPhone}</span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
