"use client";

import { Activity } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import type { WeeklyWorkoutsPoint } from "@/types/dashboard";
import { formatNumber, plural } from "@/lib/format";
import { Card, CardHeader, CardIcon } from "@/components/ui/Card";

type SeriesKey = "current" | "oneWeekAgo" | "twoWeeksAgo";

const series: { key: SeriesKey; label: string; color: string; dash?: string }[] = [
  { key: "current", label: "Semana atual", color: "var(--color-series-1)" },
  { key: "oneWeekAgo", label: "1 semana atrás", color: "var(--color-series-2)", dash: "5 4" },
  { key: "twoWeeksAgo", label: "2 semanas atrás", color: "var(--color-series-3)", dash: "2 4" },
];

const sum = (data: WeeklyWorkoutsPoint[], key: SeriesKey) =>
  data.reduce((total, d) => total + (d[key] ?? 0), 0);

function LegendSwatch({ color, dash }: { color: string; dash?: string }) {
  return (
    <svg aria-hidden width="16" height="8" className="shrink-0">
      <line x1="1" y1="4" x2="15" y2="4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeDasharray={dash} />
    </svg>
  );
}

function ChartTooltip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-40 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-pop">
      <p className="mb-1.5 text-xs font-semibold text-ink">{label}</p>
      <ul className="flex flex-col gap-1">
        {series.map((s) => {
          const entry = payload.find((p) => p.dataKey === s.key);
          if (!entry || entry.value == null) return null;
          return (
            <li key={s.key} className="flex items-center gap-2 text-xs">
              <LegendSwatch color={s.color} dash={s.dash} />
              <span className="flex-1 text-ink-2">{s.label}</span>
              <span className="tabular font-semibold text-ink">{formatNumber(Number(entry.value))}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function WeeklyWorkoutsCard({ data }: { data: WeeklyWorkoutsPoint[] }) {
  const currentTotal = sum(data, "current");
  const lastTotal = sum(data, "oneWeekAgo");
  const max = Math.max(...data.flatMap((d) => [d.current ?? 0, d.oneWeekAgo, d.twoWeeksAgo]));
  const yMax = Math.max(4, Math.ceil(max * 1.25));

  return (
    <Card labelledBy="card-weekly" className="h-full">
      <CardHeader
        id="card-weekly"
        title="Treinos da semana"
        icon={<CardIcon><Activity /></CardIcon>}
        className="mb-2"
        action={
          <p className="text-xs text-ink-3">
            <span className="tabular font-semibold text-ink">{plural(currentTotal, "treino")}</span>{" "}
            <span className="hidden sm:inline">· {formatNumber(lastTotal)} na semana passada</span>
          </p>
        }
      />

      <ul aria-label="Legenda" className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 text-xs text-ink-2">
            <LegendSwatch color={s.color} dash={s.dash} />
            {s.label}
          </li>
        ))}
      </ul>

      <div className="-mx-2 overflow-x-auto">
        <div aria-hidden className="h-56 min-w-[480px] px-1">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 224 }}>
            <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="weekly-current-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-series-1)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--color-series-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--color-line)" />
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tickMargin={10}
                tick={{ fontSize: 12, fill: "var(--color-ink-3)" }}
              />
              <YAxis
                allowDecimals={false}
                domain={[0, yMax]}
                axisLine={false}
                tickLine={false}
                tickMargin={6}
                tick={{ fontSize: 12, fill: "var(--color-ink-3)" }}
              />
              <Tooltip
                content={ChartTooltip}
                cursor={{ stroke: "var(--color-line-strong)", strokeWidth: 1 }}
              />
              <Line
                type="monotone"
                dataKey="twoWeeksAgo"
                stroke="var(--color-series-3)"
                strokeWidth={2}
                strokeDasharray="2 4"
                dot={false}
                isAnimationActive={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-surface)" }}
              />
              <Line
                type="monotone"
                dataKey="oneWeekAgo"
                stroke="var(--color-series-2)"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-surface)" }}
              />
              <Area
                type="monotone"
                dataKey="current"
                stroke="var(--color-series-1)"
                strokeWidth={2.5}
                fill="url(#weekly-current-fill)"
                connectNulls={false}
                isAnimationActive={false}
                dot={{ r: 3.5, strokeWidth: 2, stroke: "var(--color-surface)", fill: "var(--color-series-1)" }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--color-surface)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Versão tabular para leitores de tela. O sr-only fica num <div>:
          em <table> ele não recorta (overflow não se aplica a tabelas) e vaza a largura. */}
      <div className="sr-only">
        <table>
          <caption>Treinos concluídos por dia</caption>
          <thead>
            <tr>
              <th scope="col">Dia</th>
              {series.map((s) => (
                <th key={s.key} scope="col">{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.day}>
                <th scope="row">{d.day}</th>
                {series.map((s) => (
                  <td key={s.key}>{d[s.key] ?? "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
