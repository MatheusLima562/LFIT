"use client";

import { Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/db/client";
import { messages } from "@/messages/pt-BR";

const t = messages.nudge;

/**
 * Aviso gentil no Hoje depois de 7+ dias sem treinar (sem push, sem e-mail). O banco decide e marca a hora
 * (`claim_my_nudge`): no máximo 1 vez a cada 7 dias; aluno em pausa ou sem plano ativo não recebe.
 */
export function NudgeCard({ neverTrained }: { neverTrained: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [days, setDays] = useState<number | null>(null);
  useEffect(() => {
    // Sem "ignorar depois do cleanup": o 1º chamado MARCA o aviso como mostrado no banco; se a resposta dele fosse
    // descartada (efeito rodando 2x no modo estrito/remontagem), o 2º receberia show=false e o aviso se perderia.
    supabase.rpc("claim_my_nudge").then(({ data }) => {
      const r = (data ?? {}) as { show?: boolean; days_since?: number };
      if (r.show) setDays(r.days_since ?? 0);
    }, () => {});
  }, [supabase]);
  if (days === null) return null;
  return (
    <section role="status" aria-labelledby="nudge-title" className="relative flex gap-3 rounded-2xl border border-line bg-surface p-4 pr-11 shadow-card">
      <Sparkles aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-3" />
      <div>
        <h2 id="nudge-title" className="text-[15px] font-semibold text-ink">{t.title}</h2>
        <p className="mt-0.5 text-sm text-ink-2">{neverTrained ? t.textNever : t.text(days)}</p>
      </div>
      <button type="button" onClick={() => setDays(null)} aria-label={t.dismiss}
        className="absolute top-2 right-2 grid size-9 place-items-center rounded-lg text-ink-3 outline-none hover:bg-canvas focus-visible:ring-2 focus-visible:ring-ring">
        <X aria-hidden className="size-4" />
      </button>
    </section>
  );
}
