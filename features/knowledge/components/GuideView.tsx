import { Fragment } from "react";
import { AlertTriangle, ArrowUpRight, Info, PhoneCall, ShieldAlert, Stethoscope } from "lucide-react";
import { parseInline } from "@/lib/rich-tip";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import type { Guide, GuideTone } from "../types";

const t = messages.guides;

/** Texto com **negrito** (sem HTML). */
function Text({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((p, i) =>
        p.bold ? (
          <strong key={i} className="font-semibold text-ink">
            {p.text}
          </strong>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}

const TONE: Record<GuideTone, { icon: typeof PhoneCall; box: string; label: string }> = {
  emergency: { icon: PhoneCall, box: "border-danger-line bg-danger-soft text-danger-ink", label: t.tone.emergency },
  sameDay: { icon: AlertTriangle, box: "border-warning-line bg-warning-soft text-warning-ink", label: t.tone.sameDay },
  refer: { icon: Stethoscope, box: "border-line bg-canvas text-ink-2", label: t.tone.refer },
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="text-[15px] font-semibold text-ink">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Conteúdo de um Guia. `idPrefix` evita ids repetidos quando há mais de um na página. */
export function GuideView({ guide, idPrefix = "guide" }: { guide: Guide; idPrefix?: string }) {
  const id = (s: string) => `${idPrefix}-${guide.key}-${s}`;
  const hasAlerts = guide.tables.some((tb) => tb.kind === "alert");
  return (
    <article className="flex flex-col gap-6 text-[13px] leading-relaxed text-ink-2">
      <p role="note" className="flex items-start gap-2 rounded-xl border border-line bg-canvas px-3 py-2 text-[13px] text-ink">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" />
        {t.disclaimer}
      </p>

      <p className="flex items-start gap-2 text-[13px]">
        <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" />
        {hasAlerts ? t.withAlerts : t.withoutAlerts}
      </p>

      <Section id={id("summary")} title={t.summary}>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          {guide.summary.map((s, i) => (
            <li key={i}>
              <Text text={s} />
            </li>
          ))}
        </ul>
      </Section>

      {guide.tables.map((tb, i) => (
        <Section key={i} id={id(`table-${i}`)} title={tb.title}>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[36rem] border-collapse text-left text-[13px]">
              <thead className="bg-canvas text-xs text-ink-3">
                <tr>
                  {tb.columns.map((c) => (
                    <th key={c} scope="col" className="px-3 py-2 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tb.rows.map((r, j) => (
                  <tr key={j} className="border-t border-line align-top">
                    {r.map((cell, k) =>
                      k === 0 ? (
                        <th key={k} scope="row" className="px-3 py-2 font-medium text-ink">
                          <Text text={cell} />
                        </th>
                      ) : (
                        <td key={k} className="px-3 py-2">
                          <Text text={cell} />
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ))}

      {guide.notes.length > 0 && (
        <Section id={id("notes")} title={t.notes}>
          <ul className="flex flex-col gap-2">
            {guide.notes.map((n, i) => (
              <li key={i}>
                <Text text={n} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section id={id("red-flags")} title={t.redFlags}>
        <p className="text-xs text-ink-3">{t.redFlagsHint}</p>
        <div className="flex flex-col gap-2">
          {guide.redFlags.map((g, i) => {
            const tone = TONE[g.tone];
            const Icon = tone.icon;
            return (
              <div key={i} className={cn("rounded-xl border px-3 py-2", tone.box)}>
                <p className="flex items-start gap-2 font-semibold">
                  <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <span className="sr-only">{tone.label}: </span>
                    {g.title}
                  </span>
                </p>
                <ul className="mt-1 flex list-disc flex-col gap-1 pl-10">
                  {g.items.map((it, j) => (
                    <li key={j}>
                      <Text text={it} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Section>

      <Section id={id("language")} title={t.language}>
        {guide.avoidWords.length > 0 && (
          <p>
            <span className="font-medium text-ink">{t.avoidWords} </span>
            {guide.avoidWords.map((w) => `“${w}”`).join(", ")}.
          </p>
        )}
        <p className="font-medium text-ink">{t.phrases}</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {guide.phrases.map((p, i) => (
            <li key={i}>{p.replace(/^"|"$/g, "")}</li>
          ))}
        </ul>
      </Section>

      <Section id={id("refs")} title={t.references}>
        <p className="text-xs text-ink-3">{t.levels}</p>
        <ol className="flex flex-col gap-1.5 text-xs">
          {guide.references.map((r) => (
            <li key={r.id}>
              <span className="font-semibold text-ink">[{r.id}]</span> {r.text}{" "}
              {r.url && (
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 rounded link">
                  {t.openSource}
                  <ArrowUpRight aria-hidden className="size-3" />
                  <span className="sr-only">{t.newTab}</span>
                </a>
              )}
            </li>
          ))}
        </ol>
        <p className="text-xs text-ink-3">{t.source(guide.source)}</p>
      </Section>
    </article>
  );
}
