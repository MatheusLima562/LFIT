import "server-only";
import { fakeProvider, ProviderError, type AssistantProvider, type FakeMode } from "./provider";

/**
 * Provedor real: Messages API da Anthropic, chamada SÓ no servidor, chave em ANTHROPIC_API_KEY (nunca lida de arquivo
 * nem impressa). HTTP direto porque a instalação do SDK oficial (`@anthropic-ai/sdk`) ficou pendente de aprovação —
 * trocar por `client.beta.messages.create` quando instalado (mesmos campos). Sem ferramentas, sem `temperature`
 * (recusado na versão 2026-10-21). Fallback de recusa no servidor ligado (`fallbacks: "default"`).
 */
const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2026-10-21";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

interface ApiResponse {
  content?: { type: string; text?: string }[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export function anthropicProvider(apiKey: string): AssistantProvider {
  return {
    name: "anthropic",
    async reply(req, signal) {
      let res: Response;
      try {
        res = await fetch(API_URL, {
          method: "POST",
          signal,
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": API_VERSION,
            "anthropic-beta": FALLBACK_BETA,
          },
          body: JSON.stringify({
            model: req.model,
            max_tokens: req.maxTokens,
            system: req.system,
            messages: req.messages,
            // Respostas curtas de execução de treino: pouco raciocínio basta (no Opus 5.5 o raciocínio não desliga).
            output_config: { effort: "low" },
            fallbacks: "default",
          }),
        });
      } catch {
        throw new ProviderError(signal.aborted ? "timeout" : "network");
      }
      if (!res.ok) throw new ProviderError("http");
      const data = (await res.json()) as ApiResponse;
      if (data.stop_reason === "refusal") throw new ProviderError("refusal");
      const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
      if (!text) throw new ProviderError("empty");
      return { text, inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 };
    },
  };
}

/**
 * Qual provedor usar. `AI_PROVIDER=fake` (testes e e2e) é recusado em deploy de produção da Vercel. Sem chave e sem o
 * falso: null → o recurso fica indisponível com mensagem amigável.
 */
export function getProvider(): AssistantProvider | null {
  if (process.env.AI_PROVIDER === "fake" && process.env.VERCEL_ENV !== "production") {
    const mode = process.env.AI_FAKE_MODE;
    return fakeProvider(mode === "fail" || mode === "slow" ? (mode as FakeMode) : "ok");
  }
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? anthropicProvider(key) : null;
}

export function providerAvailable(): boolean {
  return getProvider() !== null;
}
