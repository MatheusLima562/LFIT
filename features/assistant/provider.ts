/**
 * Interface do provedor do Assistente de IA + provedor FALSO (testes/e2e). O real (Anthropic) fica em
 * `anthropic.ts`, só no servidor. Nenhum provedor recebe ferramentas. Nada aqui registra conteúdo em log.
 */
import type { ProviderMessage } from "./prompt";
import { COACH_MARKER } from "@/features/coach-ai/coach-ai";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Comando do personal (PARTE B) no provedor FALSO — determinístico, sem rede. Entende "supino +2,5 kg", "agachamento
 * 4 séries", "rosca 12 reps" (com "treino B" para escolher o treino). Exercício que casa com mais de um item, nenhum
 * exercício ou unidade diferente da do item → pergunta (como o real deve fazer).
 */
export function fakeCoachReply(message: string): string {
  const q = (question: string) => JSON.stringify({ type: "question", question });
  const m = /Prescrição atual \(JSON\): (.*)\nComando: ([\s\S]*)$/.exec(message);
  if (!m) return q("Não entendi o comando.");
  const plan = JSON.parse(m[1]!) as { treino: string; exercicios: { ref: string; exercicio: string; series: number | null; repeticoes: number | string | null; carga: number | null; unidade: string | null; editavel: boolean }[] }[];
  const cmd = fold(m[2]!);
  if (/\b(mensagem|agenda|agendar|pagamento|cobra|marca|envia|cadastra|dieta)\b/.test(cmd)) return JSON.stringify({ type: "unsupported" });
  const wanted = /treino ([a-z])\b/.exec(cmd)?.[1]?.toUpperCase();
  const hits = plan
    .filter((w) => !wanted || w.treino === wanted)
    .flatMap((w) => w.exercicios)
    .filter((e) => e.editavel && fold(e.exercicio).split(/\s+/).some((word) => word.length >= 4 && cmd.includes(word)));
  if (hits.length !== 1) return q(hits.length ? "Esse exercício aparece em mais de um treino. Qual treino?" : "Qual exercício?");
  const e = hits[0]!;
  // "+2,5 kg" / "mais 2,5 kg" = relativo; "45 kg" = absoluto (como se fala no ditado).
  const n = /(\+|-|mais |menos )?\s*(\d+(?:[.,]\d+)?)\s*(kg|lb|series|serie|reps|repeticoes)/.exec(cmd);
  if (!n) return q("Qual valor?");
  const value = Number(n[2]!.replace(",", "."));
  const signed = n[1] === "-" || n[1] === "menos " ? -value : value;
  const unit = n[3]!;
  if (unit === "kg" || unit === "lb") {
    if (e.unidade && e.unidade !== unit) return q(`Esse exercício está em ${e.unidade}. Confirma a unidade?`);
    const next = n[1] ? (e.carga ?? 0) + signed : value;
    return JSON.stringify({ type: "proposal", changes: [{ ref: e.ref, field: "load", value: Math.round(next * 100) / 100 }] });
  }
  if (unit.startsWith("serie")) return JSON.stringify({ type: "proposal", changes: [{ ref: e.ref, field: "sets", value: n[1] ? (e.series ?? 0) + signed : value }] });
  return JSON.stringify({ type: "proposal", changes: [{ ref: e.ref, field: "reps", value }] });
}

export interface ProviderRequest {
  model: string;
  system: string;
  messages: ProviderMessage[];
  maxTokens: number;
}

export interface ProviderReply {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AssistantProvider {
  readonly name: "fake" | "anthropic";
  reply(req: ProviderRequest, signal: AbortSignal): Promise<ProviderReply>;
}

/** Falha do provedor sem texto útil (recusa, corte, resposta vazia, erro HTTP): vira a contingência. */
export class ProviderError extends Error {
  constructor(public readonly code: "http" | "empty" | "refusal" | "timeout" | "network") {
    super(code);
  }
}

export type FakeMode = "ok" | "fail" | "slow";

/** Provedor falso: resposta fixa, sem rede. `slow` espera até ser abortado (testa o prazo de 20 s). */
export function fakeProvider(mode: FakeMode = "ok"): AssistantProvider {
  return {
    name: "fake",
    async reply(req, signal) {
      if (mode === "fail") throw new ProviderError("http");
      if (mode === "slow") {
        await new Promise<never>((_, reject) => {
          signal.addEventListener("abort", () => reject(new ProviderError("timeout")), { once: true });
        });
      }
      const last = req.messages.at(-1)?.content ?? "";
      if (req.system.startsWith(COACH_MARKER)) return { text: fakeCoachReply(last), inputTokens: 300, outputTokens: 50 };
      const exercise = /Exercício atual: (.+)/.exec(last)?.[1] ?? "o exercício";
      return { text: `Resposta de teste do Assistente de IA sobre ${exercise}: siga a prescrição do seu professor.`, inputTokens: 100, outputTokens: 20 };
    },
  };
}

/** Executa com prazo; estourou → ProviderError("timeout"). */
export async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await Promise.race([
      run(controller.signal),
      new Promise<never>((_, reject) =>
        controller.signal.addEventListener("abort", () => reject(new ProviderError("timeout")), { once: true }),
      ),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
