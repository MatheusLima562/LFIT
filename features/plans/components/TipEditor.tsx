"use client";

import { Bold, Eye, List, Pencil } from "lucide-react";
import { useRef, useState } from "react";
import { TIP_MAX } from "@/lib/rich-tip";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { RichTip } from "@/components/ui/RichTip";
import { Textarea } from "@/components/ui/textarea";

const t = messages.plans.tip;

/** Dica com barra mínima: **negrito** e lista ("- "). A prévia usa o mesmo renderizador da impressão. */
export function TipEditor({ id, value, disabled, onChange }: { id: string; value: string; disabled: boolean; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  const edit = (fn: (text: string, start: number, end: number) => { text: string; start: number; end: number }) => {
    const el = ref.current;
    if (!el) return;
    const r = fn(value, el.selectionStart, el.selectionEnd);
    onChange(r.text.slice(0, TIP_MAX));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.start, r.end);
    });
  };
  const bold = () =>
    edit((s, a, b) => {
      const sel = s.slice(a, b) || t.boldPlaceholder;
      return { text: `${s.slice(0, a)}**${sel}**${s.slice(b)}`, start: a + 2, end: a + 2 + sel.length };
    });
  const list = () =>
    edit((s, a, b) => {
      const lineStart = s.lastIndexOf("\n", a - 1) + 1;
      const lineEnd = s.indexOf("\n", b) === -1 ? s.length : s.indexOf("\n", b);
      const block = s
        .slice(lineStart, lineEnd)
        .split("\n")
        .map((l) => (l.startsWith("- ") ? l : `- ${l}`))
        .join("\n");
      return { text: s.slice(0, lineStart) + block + s.slice(lineEnd), start: lineStart, end: lineStart + block.length };
    });

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span id={`${id}-label`} className="mr-auto text-[11px] text-ink-3">
          {t.label}
        </span>
        {!disabled && !preview && (
          <>
            <Button type="button" variant="ghost" size="icon-xs" aria-label={t.bold} title={t.bold} onClick={bold}>
              <Bold aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="icon-xs" aria-label={t.list} title={t.list} onClick={list}>
              <List aria-hidden />
            </Button>
          </>
        )}
        {value.trim() && (
          <Button type="button" variant="ghost" size="xs" aria-pressed={preview} onClick={() => setPreview(!preview)}>
            {preview ? <Pencil aria-hidden /> : <Eye aria-hidden />}
            {preview ? t.edit : t.preview}
          </Button>
        )}
      </div>
      {preview ? (
        <RichTip text={value} className="min-h-8 rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[13px] text-ink-2" />
      ) : (
        <Textarea
          ref={ref}
          id={id}
          aria-labelledby={`${id}-label`}
          rows={2}
          maxLength={TIP_MAX}
          value={value}
          disabled={disabled}
          placeholder={t.placeholder}
          className="min-h-8 text-[13px]"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
