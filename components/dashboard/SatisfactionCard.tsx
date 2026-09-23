import { MessageSquareHeart, Star } from "lucide-react";
import type { SatisfactionSummary } from "@/types/dashboard";
import { formatDecimal, formatNumber, formatRelativeDays, plural } from "@/lib/format";
import { Avatar } from "@/components/ui/Avatar";
import { Card, CardFooter, CardLink } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StarRating } from "@/components/ui/StarRating";

interface SatisfactionCardProps {
  data: SatisfactionSummary;
  referenceDate: string;
}

function verdict(score: number) {
  if (score >= 4.5) return { label: "Excelente!", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
  if (score >= 4) return { label: "Muito bom", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
  if (score >= 3) return { label: "Bom", className: "bg-amber-50 text-amber-800 ring-amber-200" };
  return { label: "Precisa de atenção", className: "bg-red-50 text-red-700 ring-red-200" };
}

export function SatisfactionCard({ data, referenceDate }: SatisfactionCardProps) {
  const { average, total, distribution, latest } = data;
  const max = Math.max(...distribution.map((d) => d.count), 1);
  const v = verdict(average);

  return (
    <Card
      labelledBy="card-satisfaction"
      className="relative h-full overflow-hidden border-brand-100 bg-linear-to-br from-brand-50 via-surface to-surface"
    >
      <span aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-56 rounded-full bg-brand-100/50 blur-2xl" />

      <header className="relative mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id="card-satisfaction" className="flex min-w-0 items-center gap-2 text-xs font-semibold tracking-[0.06em] whitespace-nowrap text-ink uppercase">
          <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-brand-500 text-white shadow-[0_1px_2px_rgb(219_79_25/0.35)]">
            <Star className="size-3.5 fill-current" />
          </span>
          Satisfação dos alunos
        </h2>
        <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[10px] whitespace-nowrap font-semibold tracking-[0.08em] text-ink-2 uppercase ring-1 ring-line">
          Últimos 30 dias
        </span>
      </header>

      {total === 0 ? (
        <EmptyState icon={<MessageSquareHeart />} message="Nenhuma avaliação nos últimos 30 dias." />
      ) : (
        <>
          <div className="relative grid grid-cols-1 gap-5 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-6">
            <div className="flex flex-col items-start">
              <p className="tabular text-5xl leading-none font-semibold tracking-tight text-ink">
                {formatDecimal(average)}
              </p>
              <StarRating value={average} size="lg" className="mt-2.5" />
              <span className={`mt-3 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${v.className}`}>
                {v.label}
              </span>
              <p className="mt-1.5 text-xs text-ink-3">Baseado em {plural(total, "avaliação", "avaliações")}</p>
            </div>

            <ul aria-label="Distribuição das avaliações" className="flex flex-col gap-1.5">
              {distribution.map(({ stars, count }) => (
                <li key={stars} className="grid grid-cols-[2.25rem_1fr_1.5rem] items-center gap-2.5 text-xs">
                  <span className="inline-flex items-center gap-1 font-medium text-ink-2">
                    {stars}
                    <Star aria-hidden className="size-3 fill-amber-400 text-amber-400" />
                    <span className="sr-only">{stars === 1 ? "estrela" : "estrelas"}</span>
                  </span>
                  <span aria-hidden className="h-2 overflow-hidden rounded-full bg-surface ring-1 ring-inset ring-line">
                    <span
                      className="block h-full rounded-full bg-amber-400"
                      style={{ width: `${(count / max) * 100}%` }}
                    />
                  </span>
                  <span className="tabular text-right font-medium text-ink-2">{formatNumber(count)}</span>
                </li>
              ))}
            </ul>
          </div>

          {latest && (
            <figure className="relative mt-5 rounded-xl border border-line bg-surface/80 p-3.5">
              <figcaption className="flex items-center gap-2.5">
                <Avatar name={latest.studentName} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-ink">{latest.studentName.split(" ")[0]}</p>
                  <StarRating value={latest.rating} size="sm" />
                </div>
                <time dateTime={latest.createdAt} className="shrink-0 text-xs text-ink-3">
                  {formatRelativeDays(latest.createdAt, referenceDate)}
                </time>
              </figcaption>
              <blockquote className="mt-2 text-[13px] leading-relaxed text-ink-2">“{latest.comment}”</blockquote>
            </figure>
          )}
        </>
      )}

      <CardFooter className="relative">
        <CardLink href="/alunos?aba=feedbacks">Ver todos feedbacks</CardLink>
      </CardFooter>
    </Card>
  );
}
