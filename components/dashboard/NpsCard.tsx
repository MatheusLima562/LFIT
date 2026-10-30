import { HeartHandshake } from "lucide-react";
import { formatAverage, formatNps, quarterLabel, type NpsAggregate, type NpsSummary } from "@/features/nps/nps";
import { formatNumber } from "@/lib/format";
import { messages } from "@/messages/pt-BR";
import { Card, CardFooter } from "@/components/ui/Card";

const t = messages.nps.card;

/** Valor curto de um agregado: "+40 · 8,4" ou "—" quando há poucas respostas. */
function Short({ agg }: { agg: NpsAggregate }) {
  if (!agg.enough) return <span className="text-ink-3">{t.noValue}</span>;
  return (
    <span className="tabular font-medium text-ink">
      {formatNps(agg.nps)} · {formatAverage(agg.average)}
    </span>
  );
}

/**
 * NPS da equipe por trimestre FECHADO, só agregado (média, NPS, quantidade). Abaixo do mínimo de respostas,
 * "Poucas respostas para exibir" — nem a contagem. Nunca nome, nota ou data de um aluno. Owner: também por professor.
 */
export function NpsCard({ data }: { data: NpsSummary }) {
  const h = data.headline;

  return (
    <Card labelledBy="card-nps" className="h-full">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id="card-nps" className="flex min-w-0 items-center gap-2 text-xs font-semibold tracking-[0.06em] whitespace-nowrap text-ink uppercase">
          <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-canvas text-ink-2 ring-1 ring-line">
            <HeartHandshake className="size-3.5" />
          </span>
          {t.title}
        </h2>
        <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] whitespace-nowrap text-ink-2 uppercase ring-1 ring-line">
          {t.period(quarterLabel(data.quarter_start))}
        </span>
      </header>

      <div className="flex flex-col gap-4">
        {h.enough ? (
          <>
            <dl className="grid grid-cols-3 gap-3">
              <div>
                <dt className="text-[11px] text-ink-3">{t.nps}</dt>
                <dd className="tabular text-3xl leading-none font-semibold tracking-tight text-ink">{formatNps(h.nps)}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-ink-3">{t.average}</dt>
                <dd className="tabular text-3xl leading-none font-semibold tracking-tight text-ink">{formatAverage(h.average)}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-ink-3">{t.responsesLabel}</dt>
                <dd className="tabular text-3xl leading-none font-semibold tracking-tight text-ink">{formatNumber(h.n)}</dd>
              </div>
            </dl>
            <dl className="grid grid-cols-3 gap-2 text-center">
              {[
                [t.promoters, h.promoters],
                [t.passives, h.passives],
                [t.detractors, h.detractors],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-canvas px-2 py-2 ring-1 ring-line">
                  <dt className="text-[11px] text-ink-3">{label}</dt>
                  <dd className="tabular text-base font-semibold text-ink">{formatNumber(value as number)}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <div className="flex flex-col items-start gap-1">
            <p className="text-base font-semibold text-ink">{t.few}</p>
            <p className="text-[13px] text-ink-2">{t.fewHint(data.min_n)}</p>
          </div>
        )}

        <section aria-labelledby="nps-trend">
          <h3 id="nps-trend" className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
            {t.trend}
          </h3>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {data.quarters.map((q) => (
              <li key={q.quarter_start} className="flex items-baseline justify-between gap-2">
                <span className="text-ink-3">{quarterLabel(q.quarter_start)}</span>
                <Short agg={q} />
              </li>
            ))}
          </ul>
        </section>

        {data.by_trainer && data.by_trainer.length > 0 && (
          <section aria-labelledby="nps-trainers">
            <h3 id="nps-trainers" className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
              {t.byTrainer}
            </h3>
            <ul className="flex flex-col divide-y divide-line text-sm">
              {data.by_trainer.map((b) => (
                <li key={b.trainer_id ?? "none"} className="flex items-baseline justify-between gap-2 py-1.5">
                  <span className="min-w-0 truncate text-ink">{b.trainer_name || t.noTrainer}</span>
                  <span className="shrink-0 text-xs">{b.enough ? <Short agg={b} /> : <span className="text-ink-3">{t.few}</span>}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <CardFooter>
        <p className="text-xs text-ink-3">{t.footer}</p>
      </CardFooter>
    </Card>
  );
}
