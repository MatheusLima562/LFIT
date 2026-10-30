import Link from "next/link";
import { HeartHandshake, Lock } from "lucide-react";
import { formatNps, quarterLabel, type NpsSummary } from "@/features/nps/nps";
import { formatDate, formatNumber } from "@/lib/format";
import { messages } from "@/messages/pt-BR";
import { Card, CardFooter } from "@/components/ui/Card";

const t = messages.nps.card;

/**
 * NPS identificado dos últimos 90 dias. Abaixo de 10 respostas, só "dados insuficientes" (nada de número que engane).
 * Detratores com nome, nota e data; o comentário só vem do banco para quem vê a saúde do aluno. Owner: também por
 * professor.
 */
export function NpsCard({ data }: { data: NpsSummary }) {
  const insufficient = data.nps === null;

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
          {t.period}
        </span>
      </header>

      <div className="flex flex-col gap-4">
        {insufficient ? (
          <div className="flex flex-col items-start gap-1">
            <p className="text-xl font-semibold tracking-tight text-ink">{t.noValue}</p>
            <p className="text-[13px] text-ink-2">{t.insufficient(data.n, data.min_n)}</p>
          </div>
        ) : (
          <div className="flex items-baseline gap-3">
            <p className="tabular text-3xl leading-none font-semibold tracking-tight text-ink">{formatNps(data.nps)}</p>
            <p className="text-[13px] text-ink-2">{t.responses(data.n)}</p>
          </div>
        )}

        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            [t.promoters, data.promoters],
            [t.passives, data.passives],
            [t.detractors, data.detractors],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-canvas px-2 py-2 ring-1 ring-line">
              <dt className="text-[11px] text-ink-3">{label}</dt>
              <dd className="tabular text-base font-semibold text-ink">{formatNumber(value as number)}</dd>
            </div>
          ))}
        </dl>

        <section aria-labelledby="nps-trend">
          <h3 id="nps-trend" className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
            {t.trend}
          </h3>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
            {data.quarters.map((q) => (
              <li key={q.quarter_start} className="flex items-baseline justify-between gap-2">
                <span className="text-ink-3">{quarterLabel(q.quarter_start)}</span>
                <span className="tabular font-medium text-ink">{formatNps(q.nps)}</span>
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
                  <span className="shrink-0 text-xs text-ink-2">
                    <span className="tabular font-semibold text-ink">{formatNps(b.nps)}</span> · {t.responses(b.n)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="nps-detractors">
          <h3 id="nps-detractors" className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
            {t.detractorList}
          </h3>
          {data.detractor_list.length === 0 ? (
            <p className="text-[13px] text-ink-3">{t.noDetractors}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {data.detractor_list.map((d) => (
                <li key={`${d.student_id}-${d.submitted_at}`} className="flex flex-col gap-0.5 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link href={`/alunos/${d.student_id}/treinos`} className="link min-w-0 truncate text-sm font-medium">
                      {d.student_name}
                    </Link>
                    <span className="shrink-0 text-xs text-ink-2">
                      {t.score(d.score)} · {formatDate(d.submitted_at)}
                    </span>
                  </div>
                  {d.comment && <p className="text-[13px] break-words whitespace-pre-wrap text-ink-2">{d.comment}</p>}
                  {d.comment_hidden && (
                    <p className="flex items-center gap-1 text-xs text-ink-3">
                      <Lock aria-hidden className="size-3" />
                      {t.commentHidden}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <CardFooter>
        <p className="text-xs text-ink-3">
          {t.formula} {t.footer}
        </p>
      </CardFooter>
    </Card>
  );
}
