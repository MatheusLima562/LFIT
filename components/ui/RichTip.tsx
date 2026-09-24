import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { parseTip, type TipInline } from "@/lib/rich-tip";

const Inline = ({ parts }: { parts: TipInline[] }) => (
  <>
    {parts.map((p, i) => (p.bold ? <strong key={i} className="font-semibold">{p.text}</strong> : <Fragment key={i}>{p.text}</Fragment>))}
  </>
);

/** Renderiza a dica (negrito e lista) como elementos React — nunca como HTML. */
export function RichTip({ text, className }: { text: string; className?: string }) {
  const blocks = parseTip(text);
  if (!blocks.length) return null;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {blocks.map((b, i) =>
        b.kind === "list" ? (
          <ul key={i} className="list-disc pl-4">
            {b.items.map((it, j) => (
              <li key={j}>
                <Inline parts={it} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Inline parts={l} />
              </Fragment>
            ))}
          </p>
        ),
      )}
    </div>
  );
}
