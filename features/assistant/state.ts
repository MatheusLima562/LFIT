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
    messages: msgs.flatMap((m) => {
      const o = (m ?? {}) as Record<string, unknown>;
      if (typeof o.id !== "string" || typeof o.body !== "string") return [];
      const role = o.role === "assistant" ? "assistant" : "student";
      const kind = o.kind === "safety" || o.kind === "fallback" ? o.kind : "normal";
      return [{ id: o.id, role, kind, body: o.body } as PanelMessage];
    }),
  };
}
