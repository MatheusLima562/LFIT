import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { formatDate } from "@/lib/format";
import { todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { RichTip } from "@/components/ui/RichTip";
import { groupLabel, toBlocks } from "../builder";
import { formatLoad, planPeriod } from "../format";
import { formatIntensity, formatQuantity, formatRestRange, formatSpeed } from "../prescription";
import type { PlanForPrint } from "../queries";
import { PrintButton } from "./PrintButton";

const t = messages.plans.print;

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
        [t.period, planPeriod(plan.startsOn, plan.endsOn, plan.noEnd)],
        [t.sessions, plan.plannedSessions ? String(plan.plannedSessions) : null],
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
              {c.quantity}
            </th>
            <th scope="col" className="py-1 pr-2">
              {c.load}
            </th>
            <th scope="col" className="py-1 pr-2">
              {c.rest}
            </th>
            <th scope="col" className="py-1 pr-2">
              {c.intensity}
            </th>
            <th scope="col" className="py-1">
              {c.speed}
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
  const pr = it.prescription;
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
          {(it.methodName || it.objectiveName) && (
            <span className="block text-[11px] font-normal text-neutral-600">
              {[it.methodName ? `${messages.plans.method}: ${it.methodName}` : null, it.objectiveName ? `${messages.plans.objective}: ${it.objectiveName}` : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          {it.substitutes.length > 0 && (
            <span className="block text-[11px] font-normal text-neutral-600">
              {messages.plans.substitutes.label}: {it.substitutes.map((s) => s.name).join(", ")}
            </span>
          )}
          {it.tip && <RichTip text={it.tip} className="mt-0.5 font-normal text-neutral-700" />}
        </td>
        {detailed ? (
          <td className={cell} colSpan={6}>
            <ol className="flex flex-col gap-0.5">
              {it.setsDetail.map((set, i) => {
                const sp = set.prescription;
                const parts = [
                  messages.plans.sets.types[set.setType],
                  formatQuantity(sp.quantityUnit, sp.quantityMin, sp.quantityMax, sp.quantityNote),
                  formatLoad(set.loadValue, set.loadUnit, set.loadText),
                  formatIntensity(sp.intensityType, sp.intensityValue),
                  formatSpeed(sp.speed, sp.tempo),
                  formatRestRange(sp.restMin, sp.restMax),
                ].filter(Boolean);
                return (
                  <li key={i}>
                    <span className="font-semibold">{t.setLine(i + 1)}</span> · {parts.join(" · ")}
                  </li>
                );
              })}
            </ol>
          </td>
        ) : (
          <>
            <td className={cn(cell, "tabular-nums")}>{it.sets ?? "—"}</td>
            <td className={cell}>{formatQuantity(pr.quantityUnit, pr.quantityMin, pr.quantityMax, pr.quantityNote) ?? "—"}</td>
            <td className={cell}>
              {formatLoad(it.loadValue, it.loadUnit, it.loadText) ?? "—"}
            </td>
            <td className={cn(cell, "whitespace-nowrap")}>{formatRestRange(pr.restMin, pr.restMax) ?? "—"}</td>
            <td className={cn(cell, "whitespace-nowrap")}>{formatIntensity(pr.intensityType, pr.intensityValue) ?? "—"}</td>
            <td className="py-1.5 align-top whitespace-nowrap">{formatSpeed(pr.speed, pr.tempo) ?? "—"}</td>
          </>
        )}
      </tr>
    </>
  );
}
