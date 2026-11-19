/**
 * Interface do provedor do Assistente de IA + provedor FALSO (testes/e2e). O real (Anthropic) fica em
 * `anthropic.ts`, só no servidor. Nenhum provedor recebe ferramentas. Nada aqui registra conteúdo em log.
 */
import type { ProviderMessage } from "./prompt";

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
