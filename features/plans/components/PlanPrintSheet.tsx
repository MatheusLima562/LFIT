import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { formatDate } from "@/lib/format";
import { todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { groupLabel, toBlocks } from "../builder";
import { formatDecimal, formatLoad, formatRest, planPeriod } from "../format";
import type { PlanForPrint } from "../queries";
import { PrintButton } from "./PrintButton";

const t = messages.plans.print;

/** "10" → "10 reps"; "até a falha", "30 s", "8 por lado" ficam como estão. */
const withRepsUnit = (reps: string) =>
  /^[\d\s–-]+$/.test(reps) ? `${reps} reps` : reps;
type SavedItem = PlanForPrint["plan"]["workouts"][number]["items"][number];

/*
 * Cores fixas neutral-* (não remapeadas no tema escuro): a folha é sempre "papel branco",
 * na tela e na impressão. Nada de dados de saúde, grupos especiais ou alertas.
 */
export function PlanPrintSheet({
  data,
  backHref,
}: {
  data: PlanForPrint;
  backHref: string;
}) {
  const { plan } = data;
  const meta: [string, string | null][] = data.studentName
    ? [
        [t.student, data.studentName],
        [t.trainer, data.trainerName],
        [t.period, planPeriod(plan.startsOn, plan.endsOn)],
        [t.goal, plan.goal],
        [t.level, plan.level ? messages.plans.levels[plan.level] : null],
      ]
    : [
        [t.goal, plan.goal],
        [t.level, plan.level ? messages.plans.levels[plan.level] : null],
      ];

  return (
    <div className="min-h-dvh bg-neutral-200 py-6 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 12mm; } @media print { html, body { background: #fff !important; } }`}</style>
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4 print:hidden">
        <Button asChild variant="outline">
          <Link href={backHref}>
            <ChevronLeft aria-hidden />
            {t.back}
          </Link>
        </Button>
        <p className="order-3 w-full text-[13px] text-neutral-700 sm:order-none sm:w-auto">
          {t.hint}
        </p>
        <PrintButton />
      </div>

      <article className="mx-auto max-w-[210mm] bg-white px-4 py-6 text-neutral-900 sm:px-[12mm] sm:py-[10mm] shadow-lg [print-color-adjust:exact] print:max-w-none print:p-0 print:shadow-none">
        <header className="border-b-2 border-neutral-900 pb-3">
          <p className="text-[11px] font-semibold tracking-wider text-neutral-600 uppercase">
            {data.organizationName}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold">{plan.name}</h1>
          {!data.studentName && (
            <p className="text-sm text-neutral-600">{t.template}</p>
          )}
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-3">
            {meta
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="inline font-semibold">{k}: </dt>
                  <dd className="inline">{v}</dd>
                </div>
              ))}
          </dl>
          {plan.notes && (
            <p className="mt-2 text-[13px] whitespace-pre-line">
              <span className="font-semibold">{t.notes}: </span>
              {plan.notes}
            </p>
          )}
        </header>

        {plan.workouts.map((w, wi) => (
          <section key={wi} className="mt-5 break-inside-avoid-page">
            <h2 className="flex items-baseline gap-2 border-b border-neutral-400 pb-1 text-lg font-bold">
              <span className="rounded bg-neutral-900 px-1.5 text-white">
                {w.label}
              </span>
              {w.name}
            </h2>
            {w.notes && (
              <p className="mt-1 text-[12px] text-neutral-700">{w.notes}</p>
            )}
            {w.items.length === 0 ? (
              <p className="mt-2 text-[13px] text-neutral-600">
                {t.emptyWorkout}
              </p>
            ) : (
              <WorkoutTable items={w.items} />
            )}
          </section>
        ))}

        <footer className="mt-6 border-t border-neutral-300 pt-2 text-[10px] text-neutral-500">
          {t.generatedAt(formatDate(todayISO()))}
        </footer>
      </article>
    </div>
  );
}

function WorkoutTable({ items }: { items: SavedItem[] }) {
  // Reaproveita a lógica de blocos do montador para numerar agrupamentos (3a, 3b…).
  const blocks = toBlocks(
    items.map((it, i) => ({ key: String(i), groupKey: it.groupKey })),
  );
  const c = t.columns;
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="mt-2 w-full min-w-[560px] border-collapse text-[12px] print:min-w-0">
        <thead>
          <tr className="border-b border-neutral-900 text-left text-[10px] tracking-wider uppercase">
            <th scope="col" className="w-8 py-1 pr-1">
              {c.n}
            </th>
            <th scope="col" className="py-1 pr-2">
              {c.exercise}
            </th>
            <th scope="col" className="py-1 pr-2">
              {c.sets}
            </th>
            <th scope="col" className="py-1 pr-2">
              {c.reps}
            </th>
            <th scope="col" className="py-1 pr-2">
              {c.load}
            </th>
            <th scope="col" className="py-1 pr-2">
              {c.rest}
            </th>
            <th scope="col" className="py-1 pr-2">
              {c.tempo}
            </th>
            <th scope="col" className="py-1">
              {c.rpe}
            </th>
          </tr>
        </thead>
        {blocks.map((b, bi) => {
          const n = bi + 1;
          const grouped = b.items.length > 1;
          return (
            <tbody
              key={b.id}
              className={cn(
                "break-inside-avoid",
                grouped && "border-l-4 border-neutral-900",
              )}
            >
              {grouped && (
                <tr>
                  <td
                    colSpan={8}
                    className="pt-2 pl-2 text-[10px] font-bold tracking-wider uppercase"
                  >
                    {groupLabel(b.items.length)}
                  </td>
                </tr>
              )}
              {b.items.map((d, i) => {
                const it = items[Number(d.key)];
                const label = grouped
                  ? `${n}${String.fromCharCode(97 + i)}`
                  : String(n);
                const detailed = it.setsDetail.length > 0;
                return (
                  <ItemRows
                    key={d.key}
                    it={it}
                    label={label}
                    detailed={detailed}
                    indent={grouped}
                  />
                );
              })}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

function ItemRows({
  it,
  label,
  detailed,
  indent,
}: {
  it: SavedItem;
  label: string;
  detailed: boolean;
  indent: boolean;
}) {
  const cell = "py-1.5 pr-2 align-top";
  return (
    <>
      <tr className="border-b border-neutral-300">
        <td
          className={cn(cell, "font-semibold tabular-nums", indent && "pl-2")}
        >
          {label}
        </td>
        <td className={cn(cell, "font-semibold")}>
          {it.exerciseName}
          {it.notes && (
            <span className="block font-normal text-neutral-700">
              {it.notes}
            </span>
          )}
        </td>
        {detailed ? (
          <td className={cell} colSpan={6}>
            <ol className="flex flex-col gap-0.5">
              {it.setsDetail.map((s, i) => (
                <li key={i}>
                  <span className="font-semibold">{t.setLine(i + 1)}</span> ·{" "}
                  {messages.plans.sets.types[s.setType]}
                  {s.reps ? ` · ${withRepsUnit(s.reps)}` : ""}
                  {formatLoad(s.loadValue, s.loadUnit, s.loadText)
                    ? ` · ${formatLoad(s.loadValue, s.loadUnit, s.loadText)}`
                    : ""}
                  {s.restSeconds !== null
                    ? ` · ${formatRest(s.restSeconds)}`
                    : ""}
                </li>
              ))}
            </ol>
            {(it.tempo || it.rpeTarget !== null) && (
              <p className="mt-0.5 text-neutral-700">
                {[
                  it.tempo ? `${t.columns.tempo} ${it.tempo}` : null,
                  it.rpeTarget !== null
                    ? `RPE ${formatDecimal(it.rpeTarget)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </td>
        ) : (
          <>
            <td className={cn(cell, "tabular-nums")}>{it.sets ?? "—"}</td>
            <td className={cell}>{it.reps ?? "—"}</td>
            <td className={cell}>
              {formatLoad(it.loadValue, it.loadUnit, it.loadText) ?? "—"}
            </td>
            <td className={cn(cell, "whitespace-nowrap")}>
              {formatRest(it.restSeconds) ?? "—"}
            </td>
            <td className={cn(cell, "tabular-nums")}>{it.tempo ?? "—"}</td>
            <td className="py-1.5 align-top tabular-nums">
              {formatDecimal(it.rpeTarget) ?? "—"}
            </td>
          </>
        )}
      </tr>
    </>
  );
}
