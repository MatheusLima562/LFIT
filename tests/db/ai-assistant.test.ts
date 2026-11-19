import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, studentData, type TestOrg, type TestUser } from "./helpers";

/**
 * Assistente de IA (migration 20261119140000), sem provedor: desligado por padrão, aceite versionado, camada de
 * segurança determinística (resposta fixa + pausa + alerta no AO VIVO), pausa quando o professor escreve no chat,
 * limite diário, resposta gravada só pela secret key, contexto mínimo sem saúde, RLS no nível de saúde, retenção.
 */
interface Submit {
  status: string;
  reply?: string;
  message_id?: string;
  context?: Record<string, unknown> | null;
  history?: unknown[];
  config?: Record<string, unknown>;
}

describe.runIf(dbTestsEnabled)("assistente de IA (ai_submit_message, ai_record_reply, get_ai_assistant_state)", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, trainer: TestUser, trainer2: TestUser, studentUser: TestUser, otherStudent: TestUser, ownerB: TestUser;
  let s1: string, s2: string, session: string;
  const itemId = randomUUID();
  let version = "";

  const newSession = async (studentId: string) => {
    const { data, error } = await fx.db
      .from("workout_sessions")
      .insert({
        organization_id: org.id, student_id: studentId, workout_label: "A", status: "in_progress",
        snapshot: { items: [{ id: itemId, sets: 3, quantity_unit: "reps", quantity_min: 8, quantity_max: 12, tip: "Desça controlado", care_note: "CUIDADO-JOELHO", exercise: { name: "Agachamento" } }] },
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  };
  const submit = (u: TestUser, body: string, sid = session) => rpc<Submit>(u.client, "ai_submit_message", { p_session_id: sid, p_item_id: itemId, p_body: body });
  const state = (u: TestUser, sid = session) => rpc<Record<string, unknown>>(u.client, "get_ai_assistant_state", { p_session_id: sid });

  beforeAll(async () => {
    org = await fx.org("ai");
    orgB = await fx.org("ai-b");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer");
    trainer2 = await fx.user(org, "trainer", "t2");
    studentUser = await fx.user(org, "student", "aluno");
    otherStudent = await fx.user(org, "student", "outro");
    ownerB = await fx.user(orgB, "owner", "ob");
    s1 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    s2 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    await fx.db.from("students").update({ trainer_id: trainer.id, user_id: studentUser.id }).eq("id", s1);
    await fx.db.from("students").update({ trainer_id: trainer.id, user_id: otherStudent.id }).eq("id", s2);
    session = await newSession(s1);
  });
  afterAll(() => fx.cleanup());

  it("desligado por padrão: estado enabled=false e envio recusado (AI_DISABLED)", async () => {
    const { data } = await fx.db.from("organizations").select("ai_assistant_enabled").eq("id", org.id).single();
    expect(data!.ai_assistant_enabled).toBe(false);
    expect(await state(studentUser)).toEqual({ enabled: false });
    await expect(submit(studentUser, "como respiro?")).rejects.toThrow("AI_DISABLED");
    await fx.db.from("organizations").update({ ai_assistant_enabled: true }).eq("id", org.id);
  });

  it("aceite obrigatório e versionado", async () => {
    const st = await state(studentUser);
    expect(st.consent_required).toBe(true);
    version = st.consent_version as string;
    await expect(submit(studentUser, "como respiro?")).rejects.toThrow("AI_CONSENT_REQUIRED");
    await expect(rpc(studentUser.client, "accept_ai_terms", { p_version: "velha" })).rejects.toThrow("INVALID_INPUT");
    await rpc(studentUser.client, "accept_ai_terms", { p_version: version });
    expect((await state(studentUser)).consent_required).toBe(false);
    const { data } = await fx.db.from("ai_consents").select("version, accepted_at").eq("student_id", s1);
    expect(data).toHaveLength(1);
    expect(data![0].accepted_at).toBeTruthy();
  });

  it("mensagem normal: contexto mínimo (sem orientação de cuidado, sem nome) e resposta só pela secret key", async () => {
    const r = await submit(studentUser, "posso fazer 10 repetições?");
    expect(r.status).toBe("ok");
    expect(r.context).toMatchObject({ exercise: "Agachamento", sets: 3, quantity_min: 8, quantity_max: 12, tip: "Desça controlado" });
    const raw = JSON.stringify(r);
    expect(raw).not.toMatch(/CUIDADO-JOELHO|care_note|first_name|last_name/);
    await expect(rpc(studentUser.client, "ai_record_reply", { p_message_id: r.message_id, p_body: "forjada", p_input_tokens: 1, p_output_tokens: 1, p_failed: false })).rejects.toThrow();
    expect(await rpc(fx.db, "ai_record_reply", { p_message_id: r.message_id, p_body: "Sim, dentro da faixa.", p_input_tokens: 100, p_output_tokens: 20, p_failed: false })).toEqual({ status: "ok" });
    await expect(rpc(fx.db, "ai_record_reply", { p_message_id: r.message_id, p_body: "de novo", p_input_tokens: 1, p_output_tokens: 1, p_failed: false })).rejects.toThrow("INVALID_INPUT");
    const { data: usage } = await fx.db.from("ai_usage_daily").select("messages, input_tokens, output_tokens, cost_usd_micros").eq("organization_id", org.id).single();
    expect(usage).toMatchObject({ messages: 1, input_tokens: 100, output_tokens: 20, cost_usd_micros: 100 * 4 + 20 * 20 });
  });

  it("falha do provedor: contingência gravada e alerta 'ai_failed' no AO VIVO", async () => {
    const r = await submit(studentUser, "qual a pausa?");
    await rpc(fx.db, "ai_record_reply", { p_message_id: r.message_id, p_body: "Não consegui responder agora; avisei seu professor.", p_input_tokens: 0, p_output_tokens: 0, p_failed: true });
    const { data } = await fx.db.from("ai_session_state").select("alert_kind, paused_reason").eq("session_id", session).single();
    expect(data).toMatchObject({ alert_kind: "failure", paused_reason: null });
    const board = await rpc<{ attention: { kind: string; student_id: string }[] }>(trainer.client, "get_live_board");
    expect(board.attention).toContainEqual(expect.objectContaining({ kind: "ai_failed", student_id: s1 }));
  });

  it("segurança determinística: resposta fixa, pausa na sessão e alerta 'ai_safety' — sem modelo", async () => {
    const r = await submit(studentUser, "tô sentindo uma pontada no joelho");
    expect(r).toMatchObject({ status: "safety", reply: "Pare o exercício e aguarde seu professor." });
    expect(r.message_id).toBeUndefined();
    const { data } = await fx.db.from("ai_session_state").select("alert_kind, paused_reason").eq("session_id", session).single();
    expect(data).toMatchObject({ alert_kind: "safety", paused_reason: "safety" });
    expect(await submit(studentUser, "e agora?")).toMatchObject({ status: "paused", paused_reason: "safety" });
    const board = await rpc<{ attention: { kind: string; student_id: string }[] }>(trainer.client, "get_live_board");
    expect(board.attention).toContainEqual(expect.objectContaining({ kind: "ai_safety", student_id: s1 }));
  });

  it("professor manda mensagem no chat → IA pausa naquela sessão; resposta em andamento é descartada", async () => {
    const other = await newSession(s1);
    const r = await submit(studentUser, "como respiro?", other);
    expect(r.status).toBe("ok");
    await rpc(trainer.client, "send_chat_message", { p_student_id: s1, p_body: "Estou vendo, já vou aí", p_attached_item_id: null, p_client_msg_id: randomUUID() });
    expect(await rpc(fx.db, "ai_record_reply", { p_message_id: r.message_id, p_body: "resposta", p_input_tokens: 10, p_output_tokens: 5, p_failed: false })).toMatchObject({ status: "paused" });
    expect(await submit(studentUser, "oi", other)).toMatchObject({ status: "paused", paused_reason: "coach_message" });
    const { count } = await fx.db.from("ai_messages").select("id", { count: "exact", head: true }).eq("session_id", other).eq("role", "assistant");
    expect(count).toBe(0);
  });

  it("limite diário por aluno", async () => {
    const sid = await newSession(s1);
    const rows = Array.from({ length: 30 }, () => ({ organization_id: org.id, student_id: s1, session_id: sid, role: "student", body: "x" }));
    await fx.db.from("ai_messages").insert(rows);
    expect(await submit(studentUser, "mais uma", sid)).toEqual({ status: "limit" });
    expect((await state(studentUser, sid)).remaining_today).toBe(0);
  });

  it("RLS: aluno vê as próprias; responsável vê; outro professor, outro aluno e outra organização não", async () => {
    const count = async (u: TestUser) => ((await u.client.from("ai_messages").select("id").eq("student_id", s1)).data ?? []).length;
    expect(await count(studentUser)).toBeGreaterThan(0);
    expect(await count(trainer)).toBeGreaterThan(0);
    expect(await count(trainer2)).toBe(0);
    expect(await count(otherStudent)).toBe(0);
    expect(await count(ownerB)).toBe(0);
    await expect(state(otherStudent)).rejects.toThrow("SESSION_NOT_FOUND");
    await expect(state(trainer)).rejects.toThrow("SESSION_NOT_FOUND"); // staff não usa o assistente pelo aluno
    await expect(rpc(anon(), "ai_submit_message", { p_session_id: session, p_item_id: itemId, p_body: "x" })).rejects.toThrow();
  });

  it("conteúdo nunca vai para a auditoria", async () => {
    const { data } = await fx.db.from("audit_logs").select("diff").eq("organization_id", org.id);
    expect(JSON.stringify(data)).not.toMatch(/pontada|como respiro|repetições\?/);
  });

  it("retenção de 90 dias (só servidor)", async () => {
    const { data: old } = await fx.db
      .from("ai_messages")
      .insert({ organization_id: org.id, student_id: s1, session_id: session, role: "student", body: "antiga", created_at: new Date(Date.now() - 91 * 86_400_000).toISOString() })
      .select("id")
      .single();
    await expect(rpc(owner.client, "admin_purge_ai_data")).rejects.toThrow();
    expect(await rpc<number>(fx.db, "admin_purge_ai_data")).toBeGreaterThanOrEqual(1);
    const { data } = await fx.db.from("ai_messages").select("id").eq("id", old!.id);
    expect(data).toHaveLength(0);
  });
});
