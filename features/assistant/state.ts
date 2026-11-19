/** Leitura defensiva de `get_ai_assistant_state` (lógica pura). Formato inesperado = painel escondido. */
export interface PanelMessage {
  id: string;
  role: "student" | "assistant";
  kind: "normal" | "safety" | "fallback";
  body: string;
}

export interface AssistantState {
  enabled: boolean;
  consentRequired: boolean;
  consentVersion: string;
  pausedReason: "safety" | "coach_message" | null;
  remainingToday: number;
  maxInputChars: number;
  messages: PanelMessage[];
}

/**
 * Ordem da conversa: por horário e, no MESMO instante, a pergunta antes da resposta. A resposta fixa de segurança é
 * gravada na mesma transação da pergunta (mesmo `created_at`), e o desempate pelo id (aleatório) às vezes a punha antes.
 */
export function conversationOrder<T extends { role: "student" | "assistant"; createdAt: string }>(list: T[]): T[] {
  const rank = (m: T) => (m.role === "student" ? 0 : 1);
  return list
    .map((m, i) => ({ m, i }))
    .sort((a, b) => a.m.createdAt.localeCompare(b.m.createdAt) || rank(a.m) - rank(b.m) || a.i - b.i)
    .map((x) => x.m);
}

export function parseAssistantState(raw: unknown): AssistantState | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.enabled !== true) return { enabled: false, consentRequired: true, consentVersion: "", pausedReason: null, remainingToday: 0, maxInputChars: 0, messages: [] };
  const msgs = Array.isArray(r.messages) ? r.messages : [];
  return {
    enabled: true,
    consentRequired: r.consent_required !== false,
    consentVersion: typeof r.consent_version === "string" ? r.consent_version : "",
    pausedReason: r.paused_reason === "safety" || r.paused_reason === "coach_message" ? r.paused_reason : null,
    remainingToday: typeof r.remaining_today === "number" ? Math.max(0, r.remaining_today) : 0,
    maxInputChars: typeof r.max_input_chars === "number" ? r.max_input_chars : 500,
    messages: conversationOrder(
      msgs.flatMap((m) => {
        const o = (m ?? {}) as Record<string, unknown>;
        if (typeof o.id !== "string" || typeof o.body !== "string") return [];
        const role: PanelMessage["role"] = o.role === "assistant" ? "assistant" : "student";
        const kind: PanelMessage["kind"] = o.kind === "safety" || o.kind === "fallback" ? o.kind : "normal";
        return [{ id: o.id, role, kind, body: o.body, createdAt: typeof o.created_at === "string" ? o.created_at : "" }];
      }),
    ).map(({ id, role, kind, body }) => ({ id, role, kind, body })),
  };
}
