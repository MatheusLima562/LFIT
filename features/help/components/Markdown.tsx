import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { Fragment } from "react";
import { messages } from "@/messages/pt-BR";
import { type Block, type Inline, parseMarkdown } from "../markdown";

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((i, n) => {
        if (i.kind === "strong") return <strong key={n} className="font-semibold text-ink">{i.text}</strong>;
        if (i.kind === "code") return <code key={n} className="rounded bg-canvas px-1 py-0.5 text-[0.9em] ring-1 ring-line">{i.text}</code>;
        if (i.kind === "link") {
          return i.href.startsWith("#") ? (
            <a key={n} href={i.href} className="link">{i.text}</a>
          ) : (
            <Link key={n} href={i.href} className="link">{i.text}</Link>
          );
        }
        return <Fragment key={n}>{i.text}</Fragment>;
      })}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "heading":
      return block.level === 2 ? (
        <h2 id={block.id} className="mt-8 scroll-mt-20 text-lg font-semibold tracking-tight text-ink first:mt-0">
          <Inlines items={block.content} />
        </h2>
      ) : (
        <h3 id={block.id} className="mt-5 scroll-mt-20 text-[15px] font-semibold text-ink">
          <Inlines items={block.content} />
        </h3>
      );
    case "paragraph":
      return <p className="mt-3 text-[15px] leading-relaxed text-ink-2"><Inlines items={block.content} /></p>;
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className={`mt-3 flex flex-col gap-1.5 pl-6 text-[15px] leading-relaxed text-ink-2 ${block.ordered ? "list-decimal" : "list-disc"}`}>
          {block.items.map((item, n) => (
            <li key={n} className="pl-1 marker:text-ink-3"><Inlines items={item} /></li>
          ))}
        </Tag>
      );
    }
    case "callout":
      return (
        <div className="mt-4 flex gap-2.5 rounded-xl bg-canvas px-3.5 py-3 text-[14px] leading-relaxed text-ink-2 ring-1 ring-line">
          <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" />
          <p><Inlines items={block.content} /></p>
        </div>
      );
  }
}

/** Corpo de um tutorial, com índice ("Neste tutorial") a partir dos títulos de seção. */
export function Markdown({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  const sections = blocks.filter((b): b is Extract<Block, { kind: "heading" }> => b.kind === "heading" && b.level === 2);
  return (
    <>
      {sections.length > 2 && (
        <nav aria-labelledby="toc-title" className="mb-2 rounded-xl bg-surface p-4 ring-1 ring-line">
          <h2 id="toc-title" className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{messages.help.toc}</h2>
          <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-[14px] text-ink-2">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="link">{s.content.map((i) => i.text).join("")}</a>
              </li>
            ))}
          </ol>
        </nav>
      )}
      {blocks.map((b, n) => <BlockView key={n} block={b} />)}
    </>
  );
}
