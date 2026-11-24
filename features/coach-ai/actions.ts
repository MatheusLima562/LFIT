"use server";

import { z } from "zod";
import { getProvider } from "@/features/assistant/anthropic";
import { ProviderError, withTimeout } from "@/features/assistant/provider";
import type { Change } from "@/features/prescription/prescription";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { buildUserMessage, COACH_SYSTEM, parseCoachContext, parseReply, redactNames, validateProposal, type ProposalRow } from "./coach-ai";

const t = messages.coachAi;

export type CoachResult =
  | { status: "proposal"; changes: Change[]; rows: ProposalRow[]; remaining: number }
  | { status: "question"; question: string; remaining: number }
  | { status: "error"; message: string };

const input = z.object({ studentId: z.uuid(), command: z.string().trim().min(1).max(1000) });

/**
 * Comando do personal (PARTE B). Ordem: (1) `ai_coach_begin` com a sessão do personal decide tudo (acesso ao aluno,
 * conta gravável, ligado, plano Pro/Gold, tamanho, limite do dia, treino ativo) e devolve só o contexto mínimo;
 * (2) o nome do aluno sai do texto; (3) o provedor é chamado no servidor, com prazo; (4) a resposta é validada contra a
 * prescrição atual; (5) tokens e custo vão para o banco com a secret key. NUNCA grava a prescrição: devolve a proposta
 * para o personal confirmar (aplicação = `apply_prescription_changes`, origem "ai"). Nada do comando vai para log.
 */
export async function runCoachCommand(studentId: string, command: string): Promise<CoachResult> {
  const parsed = input.safeParse({ studentId, command });
  if (!parsed.success) return { status: "error", message: t.errors.invalid };
  const provider = getProvider();
  if (!provider) return { status: "error", message: t.errors.unavailable };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ai_coach_begin", { p_student_id: parsed.data.studentId, p_command: parsed.data.command });
  if (error) {
    if (error.message === "AI_DISABLED") return { status: "error", message: t.errors.disabled };
    if (error.message === "AI_PLAN_REQUIRED") return { status: "error", message: t.errors.plan };
    if (error.message === "INVALID_INPUT") return { status: "error", message: t.errors.tooLong };
    return { status: "error", message: dbErrorMessage(error) };
  }
  const r = (data ?? {}) as { status?: string; request_id?: string; remaining_today?: number; redact?: unknown; config?: { model: string; max_output_tokens: number; timeout_ms: number } };
  if (r.status === "no_plan") return { status: "error", message: t.errors.noPlan };
  if (r.status === "limit") return { status: "error", message: t.errors.limit };
  if (r.status !== "ok" || !r.request_id || !r.config) return { status: "error", message: t.errors.generic };

  const workouts = parseCoachContext(data);
  const names = (Array.isArray(r.redact) ? r.redact : []).filter((x): x is string => typeof x === "string");
  const safeCommand = redactNames(parsed.data.command, names);
  const remaining = r.remaining_today ?? 0;

  let text = "";
  let inTok = 0;
  let outTok = 0;
  let failure: "timeout" | "other" | null = null;
  try {
    const out = await withTimeout(r.config.timeout_ms, (signal) =>
      provider.reply(
        { model: r.config!.model, system: COACH_SYSTEM, messages: [{ role: "user", content: buildUserMessage(workouts, safeCommand) }], maxTokens: r.config!.max_output_tokens },
        signal,
      ),
    );
    text = out.text;
    inTok = out.inputTokens;
    outTok = out.outputTokens;
  } catch (e) {
    failure = e instanceof ProviderError && e.code === "timeout" ? "timeout" : "other";
  }
  await createAdminClient().rpc("ai_coach_finish", { p_request_id: r.request_id, p_input_tokens: inTok, p_output_tokens: outTok, p_failed: failure !== null });

  if (failure === "timeout") return { status: "error", message: t.errors.timeout };
  if (failure) return { status: "error", message: t.errors.generic };
  const reply = parseReply(text);
  if (reply.type === "question") return { status: "question", question: reply.question, remaining };
  if (reply.type === "proposal") {
    const v = validateProposal(reply, workouts);
    if (v.ok) return { status: "proposal", changes: v.changes, rows: v.rows, remaining };
  }
  return { status: "error", message: t.errors.notUnderstood };
}
