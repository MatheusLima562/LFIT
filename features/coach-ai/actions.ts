"use server";

import { z } from "zod";
import { getProvider } from "@/features/assistant/anthropic";
import { ProviderError, withTimeout } from "@/features/assistant/provider";
import type { Change } from "@/features/prescription/prescription";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import {
  buildUserMessage, COACH_SYSTEM, looksLikePrescription, matchStudents, parseCoachContext, parseReply, redactNames,
  replaceStudentName, validateProposal, type ProposalRow, type StudentRef,
} from "./coach-ai";

const t = messages.coachAi;

export type CoachResult =
  | { status: "proposal"; changes: Change[]; rows: ProposalRow[]; remaining: number; studentName?: string }
  | { status: "question"; question: string; remaining: number }
  | { status: "choose"; options: { id: string; name: string }[] }
  | { status: "info"; message: string }
  | { status: "error"; message: string };

const input = z.object({ studentId: z.uuid(), command: z.string().trim().min(1).max(1000) });
const centralInput = z.object({ studentId: z.uuid().nullable(), command: z.string().trim().min(1).max(1000) });

/**
 * Núcleo (PARTE B). Ordem: (1) `ai_coach_begin` com a sessão do personal decide tudo (acesso ao aluno, conta gravável,
 * ligado, plano Pro/Gold, tamanho, TERMOS DE SAÚDE, limite do dia, treino ativo) e devolve só o contexto mínimo;
 * (2) `prepare` tira o nome do aluno do texto; (3) provedor no servidor, com prazo; (4) resposta validada contra a
 * prescrição atual; (5) tokens e custo com a secret key. NUNCA grava a prescrição. Nada do comando vai para log.
 */
async function coachCore(studentId: string, command: string, prepare: (text: string, names: string[]) => string): Promise<CoachResult> {
  const provider = getProvider();
  if (!provider) return { status: "error", message: t.errors.unavailable };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ai_coach_begin", { p_student_id: studentId, p_command: command });
  if (error) {
    if (error.message === "AI_DISABLED") return { status: "error", message: t.errors.disabled };
    if (error.message === "AI_PLAN_REQUIRED") return { status: "error", message: t.errors.plan };
    if (error.message === "AI_HEALTH_TERMS") return { status: "error", message: t.errors.health };
    if (error.message === "INVALID_INPUT") return { status: "error", message: t.errors.tooLong };
    return { status: "error", message: dbErrorMessage(error) };
  }
  const r = (data ?? {}) as { status?: string; request_id?: string; remaining_today?: number; redact?: unknown; config?: { model: string; max_output_tokens: number; timeout_ms: number } };
  if (r.status === "no_plan") return { status: "error", message: t.errors.noPlan };
  if (r.status === "limit") return { status: "error", message: t.errors.limit };
  if (r.status !== "ok" || !r.request_id || !r.config) return { status: "error", message: t.errors.generic };

  const workouts = parseCoachContext(data);
  const names = (Array.isArray(r.redact) ? r.redact : []).filter((x): x is string => typeof x === "string");
  const safeCommand = prepare(command, names);
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
  if (reply.type === "unsupported") return { status: "info", message: t.errors.unsupported };
  if (reply.type === "question") return { status: "question", question: reply.question, remaining };
  if (reply.type === "proposal") {
    const v = validateProposal(reply, workouts);
    if (v.ok) return { status: "proposal", changes: v.changes, rows: v.rows, remaining };
  }
  return { status: "error", message: t.errors.notUnderstood };
}

/** Comando na ficha de um aluno (aluno já aberto): o nome dele, se digitado, vira "o aluno". */
export async function runCoachCommand(studentId: string, command: string): Promise<CoachResult> {
  const parsed = input.safeParse({ studentId, command });
  if (!parsed.success) return { status: "error", message: t.errors.invalid };
  return coachCore(parsed.data.studentId, parsed.data.command, (text, names) => redactNames(text, names));
}

/**
 * Microfone central (complemento da PARTE B). Com aluno aberto (`studentId`), usa ele. Sem aluno aberto, o SERVIDOR
 * procura o nome entre os alunos que o personal acessa (RLS): 1 → segue, 2+ → pergunta qual, 0 → "não encontrei". O
 * nome vira código (ALUNO_1) antes do provedor; a proposta volta com o nome completo. Só prescrição: outro pedido →
 * "ainda não faço isso" (sem gastar chamada).
 */
export async function runCentralCoachCommand(command: string, studentId: string | null): Promise<CoachResult> {
  const parsed = centralInput.safeParse({ studentId, command });
  if (!parsed.success) return { status: "error", message: t.errors.invalid };
  const text = parsed.data.command;
  if (!looksLikePrescription(text)) return { status: "info", message: t.errors.unsupported };

  const supabase = await createClient();
  const { data: rows, error } = await supabase.from("students").select("id, first_name, last_name").is("deleted_at", null).limit(2000);
  if (error) return { status: "error", message: t.errors.generic };
  const students: StudentRef[] = (rows ?? []).map((s) => ({ id: s.id, firstName: s.first_name, lastName: s.last_name }));
  const fullName = (s: StudentRef) => `${s.firstName} ${s.lastName}`.trim();

  let student: StudentRef | undefined;
  if (parsed.data.studentId) {
    student = students.find((s) => s.id === parsed.data.studentId);
    if (!student) return { status: "error", message: messages.dbErrors.STUDENT_NOT_FOUND };
  } else {
    const found = matchStudents(text, students);
    if (found.length === 0) return { status: "info", message: t.mic.notFound };
    if (found.length > 1) {
      return { status: "choose", options: found.slice(0, 6).map((s) => ({ id: s.id, name: fullName(s) })) };
    }
    student = found[0]!;
  }
  const s = student;
  const out = await coachCore(s.id, text, (raw) => replaceStudentName(raw, s));
  return out.status === "proposal" ? { ...out, studentName: fullName(s) } : out;
}
