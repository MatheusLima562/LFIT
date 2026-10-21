import { Star } from "lucide-react";
import type { SatisfactionView } from "@/features/dashboard/stats";
import { formatNumber } from "@/lib/format";
import { Card, CardFooter } from "@/components/ui/Card";
import { StarRating } from "@/components/ui/StarRating";

/**
 * Satisfação dos alunos: média das notas (1 a 5) dadas no fim do treino nos últimos 30 dias, com a quantidade de notas
 * e a distribuição. Só agregados — nunca a nota ou o comentário de um aluno. Sem nenhuma nota, o card não é montado.
 */
export function SatisfactionCard({ data }: { data: SatisfactionView }) {
  const max = Math.max(...data.distribution.map((d) => d.count), 1);

  return (
    <Card labelledBy="card-satisfaction" className="h-full">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id="card-satisfaction" className="flex min-w-0 items-center gap-2 text-xs font-semibold tracking-[0.06em] whitespace-nowrap text-ink uppercase">
          <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-canvas text-ink-2 ring-1 ring-line">
            <Star className="size-3.5" />
          </span>
          Satisfação dos alunos
        </h2>
        <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] whitespace-nowrap text-ink-2 uppercase ring-1 ring-line">
          Últimos 30 dias
        </span>
      </header>

      {data.insufficient ? (
        // Histórico curto: nada de média (enganaria) — só quantas notas já chegaram e quando a média passa a valer.
        <div className="flex flex-col items-start gap-1">
          <p className="text-xl font-semibold tracking-tight text-ink">{data.headline}</p>
          <p className="text-[13px] text-ink-2">{data.insufficient}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-6">
          <div className="flex flex-col items-start">
            <p className="tabular text-3xl leading-none font-semibold tracking-tight text-ink">{data.headline}</p>
            <StarRating value={data.average} size="lg" className="mt-2.5" />
          </div>

          <ul aria-label="Distribuição das notas" className="flex flex-col gap-1.5">
            {data.distribution.map(({ stars, count }) => (
              <li key={stars} className="grid grid-cols-[2.25rem_1fr_1.5rem] items-center gap-2.5 text-xs">
                <span className="inline-flex items-center gap-1 font-medium text-ink-2">
                  {stars}
                  <Star aria-hidden className="size-3 fill-ink-3 text-ink-3" />
                  <span className="sr-only">{stars === 1 ? "estrela" : "estrelas"}</span>
                </span>
                <span aria-hidden className="h-2 overflow-hidden rounded-full bg-canvas ring-1 ring-line ring-inset">
                  <span className="block h-full rounded-full bg-ink-3" style={{ width: `${(count / max) * 100}%` }} />
                </span>
                <span className="tabular text-right font-medium text-ink-2">{formatNumber(count)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <CardFooter>
        <p className="text-xs text-ink-3">Notas de 1 a 5 que os alunos dão, se quiserem, ao terminar o treino.</p>
      </CardFooter>
    </Card>
  );
}
