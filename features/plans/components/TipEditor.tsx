"use client";

import { Bold, List } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { joinRuns, sanitizeTip, TIP_MAX, type TipInline } from "@/lib/rich-tip";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";

const t = messages.plans.tip;

/*
 * Editor simples com a formatação visível (negrito e lista aparecem formatados enquanto digita).
 * O armazenamento continua sendo o texto saneado (**negrito** e "- " no início da linha): o DOM é
 * convertido de volta a cada digitação e passa por sanitizeTip. Nada de HTML sai daqui; a carga
 * inicial monta os nós com a API do DOM (textContent), nunca com innerHTML.
 */

type Line = { list: boolean; runs: TipInline[] };

/** DOM do editor → texto armazenado. `raw` (antes do corte em TIP_MAX) serve para o contador. */
function toText(root: HTMLElement): { text: string; raw: string } {
  const lines: Line[] = [];
  let cur: Line | null = null;
  const start = (list: boolean) => {
    cur = { list, runs: [] };
    lines.push(cur);
    return cur;
  };
  const walk = (node: Node, bold: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      (cur ?? start(false)).runs.push({ text: (node.textContent ?? "").replace(/\n/g, " ").replace(/\*\*/g, "*"), bold });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName;
    if (tag === "BR") {
      if (!cur) start(false);
      cur = null;
      return;
    }
    const weight = node.style.fontWeight;
    const isBold = bold || tag === "B" || tag === "STRONG" || weight === "bold" || Number(weight) >= 600;
    if (tag === "UL" || tag === "OL") {
      cur = null;
      node.childNodes.forEach((c) => walk(c, isBold));
      cur = null;
      return;
    }
    if (tag === "DIV" || tag === "P" || tag === "LI") {
      // O Chrome embrulha listas em <div>: um bloco que contém outros blocos não abre linha própria.
      const wrapper = [...node.children].some((c) => ["UL", "OL", "DIV", "P"].includes(c.tagName));
      if (wrapper && tag !== "LI") cur = null;
      else start(tag === "LI");
      node.childNodes.forEach((c) => walk(c, isBold));
      cur = null;
      return;
    }
    node.childNodes.forEach((c) => walk(c, isBold));
  };
  root.childNodes.forEach((c) => walk(c, false));
  const raw = lines.map((l) => (l.list ? "- " : "") + joinRuns(l.runs)).join("\n");
  return { text: sanitizeTip(raw), raw: raw.trim() };
}

function fillFromText(root: HTMLElement, text: string) {
  root.replaceChildren();
  let ul: HTMLUListElement | null = null;
  const inline = (parent: HTMLElement, line: string) => {
    const re = /\*\*(.+?)\*\*/g;
    let last = 0;
    for (let m = re.exec(line); m; m = re.exec(line)) {
      if (m.index > last) parent.append(document.createTextNode(line.slice(last, m.index)));
      const b = document.createElement("b");
      b.textContent = m[1];
      parent.append(b);
      last = m.index + m[0].length;
    }
    if (last < line.length) parent.append(document.createTextNode(line.slice(last)));
    if (!parent.childNodes.length) parent.append(document.createElement("br"));
  };
  for (const line of sanitizeTip(text).split("\n")) {
    if (!text.trim()) break;
    const item = /^- (.*)$/.exec(line);
    if (item) {
      if (!ul) {
        ul = document.createElement("ul");
        root.append(ul);
      }
      const li = document.createElement("li");
      inline(li, item[1]);
      ul.append(li);
      continue;
    }
    ul = null;
    const div = document.createElement("div");
    inline(div, line);
    root.append(div);
  }
}

export function TipEditor({ id, value, disabled, onChange }: { id: string; value: string; disabled: boolean; onChange: (v: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const emitted = useRef<string | null>(null);
  const [empty, setEmpty] = useState(!value.trim());
  const [length, setLength] = useState(value.length);
  const [active, setActive] = useState({ bold: false, list: false });

  // Carga inicial e mudanças vindas de fora (não as que o próprio editor emitiu).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || value === emitted.current) return;
    fillFromText(el, value);
    emitted.current = value;
  }, [value]);

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { text, raw } = toText(el);
    emitted.current = text;
    setEmpty(!el.textContent?.trim() && !el.querySelector("li"));
    setLength(raw.length);
    onChange(text);
  }, [onChange]);

  const refreshState = useCallback(() => {
    const el = ref.current;
    const sel = document.getSelection();
    if (!el || !sel?.anchorNode || !el.contains(sel.anchorNode)) return;
    setActive({ bold: document.queryCommandState("bold"), list: document.queryCommandState("insertUnorderedList") });
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", refreshState);
    return () => document.removeEventListener("selectionchange", refreshState);
  }, [refreshState]);

  const command = (name: "bold" | "insertUnorderedList") => {
    ref.current?.focus();
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(name);
    sync();
    refreshState();
  };

  const over = length > TIP_MAX;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span id={`${id}-label`} className="mr-auto text-[11px] text-ink-3">
          {t.label}
        </span>
        {!disabled && (
          <div role="toolbar" aria-label={t.toolbar} aria-controls={id} className="flex items-center gap-0.5">
            {/* onMouseDown evita tirar a seleção do texto antes de aplicar o comando. */}
            <Button type="button" variant="ghost" size="icon-xs" aria-label={t.bold} aria-pressed={active.bold} title={t.boldShortcut} onMouseDown={(e) => e.preventDefault()} onClick={() => command("bold")}>
              <Bold aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="icon-xs" aria-label={t.list} aria-pressed={active.list} title={t.list} onMouseDown={(e) => e.preventDefault()} onClick={() => command("insertUnorderedList")}>
              <List aria-hidden />
            </Button>
          </div>
        )}
      </div>
      <div className="relative">
        <div
          ref={ref}
          id={id}
          role="textbox"
          aria-multiline="true"
          aria-labelledby={`${id}-label`}
          aria-describedby={over ? `${id}-count` : undefined}
          aria-disabled={disabled || undefined}
          aria-invalid={over || undefined}
          contentEditable={!disabled}
          suppressContentEditableWarning
          tabIndex={disabled ? -1 : 0}
          onInput={sync}
          onKeyUp={refreshState}
          onMouseUp={refreshState}
          onPaste={(e) => {
            // Só texto puro: formatação de fora (Word, sites) não entra.
            e.preventDefault();
            document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
          }}
          onDrop={(e) => e.preventDefault()}
          className={cn(
            "min-h-14 w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-[13px] text-ink outline-none",
            "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive",
            "[&_b]:font-semibold [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5",
            disabled && "cursor-not-allowed opacity-60",
          )}
        />
        {empty && (
          <span aria-hidden className="pointer-events-none absolute top-1.5 left-2.5 text-[13px] text-ink-3">
            {t.placeholder}
          </span>
        )}
      </div>
      {(over || length > TIP_MAX - 100) && (
        <span id={`${id}-count`} className={cn("self-end text-[11px]", over ? "text-destructive" : "text-ink-3")}>
          {t.count(length, TIP_MAX)}
        </span>
      )}
    </div>
  );
}
