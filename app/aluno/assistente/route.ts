import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getProvider } from "@/features/assistant/anthropic";
import { buildMessages, SYSTEM_PROMPT, type AssistantContext, type HistoryMessage } from "@/features/assistant/prompt";
import { withTimeout } from "@/features/assistant/provider";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { messages } from "@/messages/pt-BR";

/**
 * Assistente de IA (aluno, tela de execução). Ordem: (1) `ai_submit_message` com a sessão DO ALUNO decide tudo —
 * acesso, ligado, aceite, pausa, limite e a camada de segurança determinística (sem modelo); (2) só com status `ok`
 * chama o provedor no servidor, com prazo; (3) grava a resposta ou a contingência com a secret key
 * (`ai_record_reply`, só service_role). Nada de conteúdo em log; erros saem só como status fixos.
 */
const bodySchema = z.object({
  sessionId: z.uuid(),
  itemId: z.uuid().nullable(),
  text: z.string().min(1).max(2000),
});

type Out =
  | { status: "ok" | "safety" | "fallback"; reply: string; remaining: number | null }
  | { status: "paused" | "limit" | "unavailable" | "disabled" | "consent_required" | "closed" | "error" };

const json = (o: Out, code = 200) => NextResponse.json(o, { status: code });

export async function POST(request: NextRequest) {
  const provider = getProvider();
  if (!provider) return json({ status: "unavailable" });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ status: "error" }, 400);
  const { sessionId, itemId, text } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ai_submit_message", { p_session_id: sessionId, p_item_id: itemId as string, p_body: text });
  if (error) {
    const code = error.message;
    if (code === "AI_DISABLED") return json({ status: "disabled" });
    if (code === "AI_CONSENT_REQUIRED") return json({ status: "consent_required" });
    if (code === "SESSION_CLOSED") return json({ status: "closed" });
    return json({ status: "error" });
  }
  const r = data as unknown as {
    status: "ok" | "safety" | "paused" | "limit";
    reply?: string;
    message_id?: string;
    remaining_today?: number;
    context?: AssistantContext | null;
    history?: HistoryMessage[];
    config?: { model: string; max_output_tokens: number; timeout_ms: number };
  };
  if (r.status === "paused" || r.status === "limit") return json({ status: r.status });
  if (r.status === "safety") return json({ status: "safety", reply: r.reply ?? messages.assistant.safetyReply, remaining: r.remaining_today ?? null });

  const cfg = r.config!;
  let reply: string = messages.assistant.fallback;
  let failed = true;
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const out = await withTimeout(cfg.timeout_ms, (signal) =>
      provider.reply(
        { model: cfg.model, system: SYSTEM_PROMPT, messages: buildMessages(r.context ?? null, r.history ?? [], text), maxTokens: cfg.max_output_tokens },
        signal,
      ),
    );
    reply = out.text;
    failed = false;
    inputTokens = out.inputTokens;
    outputTokens = out.outputTokens;
  } catch {
    // Contingência: "Não consegui responder agora; avisei seu professor" + alerta no AO VIVO (ai_record_reply).
  }

  const admin = createAdminClient();
  const { data: rec, error: recError } = await admin.rpc("ai_record_reply", {
    p_message_id: r.message_id!,
    p_body: reply,
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
    p_failed: failed,
  });
  if (recError) return json({ status: "error" });
  if ((rec as { status?: string })?.status === "paused") return json({ status: "paused" });
  return json({ status: failed ? "fallback" : "ok", reply, remaining: r.remaining_today ?? null });
}
