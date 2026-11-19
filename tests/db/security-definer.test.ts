import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, spDateDaysAgo, studentData, type TestOrg, type TestUser } from "./helpers";

/**
 * Funções SECURITY DEFINER expostas ao papel `authenticated` (Security Advisor).
 * Cada uma deve checar internamente auth.uid(), organização e papel.
 */
describe.runIf(dbTestsEnabled)("SECURITY DEFINER: usuário com papel student é recusado", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, student: TestUser, ownerB: TestUser;
  let studentId: string, otherId: string, pendingId: string, templateId: string, fullName: string;

  beforeAll(async () => {
    org = await fx.org("secdef");
    orgB = await fx.org("secdef-b");
    owner = await fx.user(org, "owner");
    student = await fx.user(org, "student");
    ownerB = await fx.user(orgB, "owner");

    const own = await rpc<{ id: string; first_name: string; last_name: string }>(owner.client, "create_student", { p_data: studentData() });
    studentId = own.id;
    fullName = `${own.first_name} ${own.last_name}`;
    // O aluno logado É este aluno: nem sobre o próprio cadastro ele pode agir.
    await fx.db.from("students").update({ user_id: student.id }).eq("id", studentId);
    otherId = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;

    const link = await rpc<{ token: string }>(owner.client, "ensure_signup_link");
    await owner.client.from("public_signup_links").update({ is_active: true }).eq("organization_id", org.id);
    pendingId = await rpc<string>(fx.db, "submit_public_signup", { p_token: link.token, p_payload: studentData(), p_consent: false });
    const { data: tpl } = await fx.db.from("anamnesis_templates").insert({ organization_id: org.id, title: "Modelo" }).select("id").single();
    templateId = tpl!.id;
  });
  afterAll(() => fx.cleanup());

  // As 7 pedidas explicitamente + todas as demais RPCs de escrita/gestão.
  const forbidden: [string, () => Record<string, unknown>][] = [
    ["hard_delete_student", () => ({ p_student_id: studentId, p_confirm_name: fullName })],
    ["soft_delete_student", () => ({ p_student_id: studentId, p_confirm_name: fullName })],
    ["update_student", () => ({ p_student_id: studentId, p_patch: { first_name: "Hack" } })],
    ["reactivate_student", () => ({ p_student_id: studentId })],
    ["log_students_export", () => ({ p_format: "csv", p_count: 1, p_filters: {} })],
    ["regenerate_signup_token", () => ({})],
    ["reject_signups", () => ({ p_ids: [pendingId] })],
    ["create_student", () => ({ p_data: studentData() })],
    ["deactivate_student", () => ({ p_student_id: studentId })],
    ["expire_student", () => ({ p_student_id: studentId })],
    ["clear_student_expiration", () => ({ p_student_id: studentId })],
    ["create_access_link", () => ({ p_student_id: studentId })],
    ["record_student_access_email", () => ({ p_student_id: studentId })],
    ["request_anamnesis", () => ({ p_student_id: studentId, p_template_id: templateId })],
    ["ensure_signup_link", () => ({})],
    ["approve_signup", () => ({ p_id: pendingId })],
    ["approve_signups", () => ({ p_ids: [pendingId] })],
    ["record_red_flag_check", () => ({ p_student_id: studentId, p_items: ["recent_trauma"] })],
    ["plan_red_flag_pending", () => ({ p_plan_id: studentId })],
    // Fase 3: avisos de dor são só do staff; o modo presencial (p_student_id) exige staff.
    ["student_session_alerts", () => ({ p_student_id: studentId })],
    ["acknowledge_session_alert", () => ({ p_session_id: studentId })],
    ["get_my_active_plan", () => ({ p_student_id: otherId })],
    // 2.12: chat/recado/resumo de OUTRO aluno, e as de staff.
    ["send_chat_message", () => ({ p_student_id: otherId, p_body: "x", p_client_msg_id: randomUUID() })],
    ["mark_chat_read", () => ({ p_student_id: otherId, p_until_message_id: randomUUID() })],
    ["chat_unread_count", () => ({ p_student_id: otherId })],
    ["get_my_announcement", () => ({ p_student_id: otherId })],
    ["get_session_summary", () => ({ p_session_id: randomUUID() })],
    ["set_trainer_announcement", () => ({ p_body: "x", p_student_id: studentId })],
    ["reply_to_session", () => ({ p_session_id: randomUUID(), p_reply: "x" })],
    // 3.3: encerrar recado é do staff (autor).
    ["end_trainer_announcement", () => ({ p_announcement_id: randomUUID() })],
    // Base do presencial: modalidade é escrita do staff com acesso ao aluno.
    ["set_student_modality", () => ({ p_student_id: studentId, p_modality: "presencial" })],
    // 3.2: nota de satisfação — só o aluno dono da sessão (o "student" deste teste não tem sessão).
    ["rate_workout_session", () => ({ p_session_id: randomUUID(), p_rating: 5 })],
    // Início com dados reais: só staff (contagens da organização/dos seus alunos).
    ["get_dashboard_training_stats", () => ({})],
    ["get_dashboard_engagement_retention", () => ({})],
    // NPS: resumo, estado e lembrete são do staff (submit/snooze são do próprio aluno; request_nps sem EXECUTE desde a
    // v2 — tests/db/nps.test.ts).
    ["get_nps_summary", () => ({})],
    ["get_nps_status", () => ({ p_student_id: studentId })],
    ["send_nps_reminder", () => ({ p_student_id: studentId })],
    // Feed (20261119160000): publicar, editar, fixar, apagar e listar são do staff.
    ["save_feed_post", () => ({ p_data: { kind: "text", body: "x", audience: "all" } })],
    ["delete_feed_post", () => ({ p_id: randomUUID() })],
    ["set_feed_post_pinned", () => ({ p_id: randomUUID(), p_pinned: true })],
    ["list_feed_posts", () => ({})],
    // Plataforma (20261120120000): nenhum usuário de organização (nem aluno) está na lista da plataforma.
    ["platform_list_accounts", () => ({})],
    ["platform_account_detail", () => ({ p_org: randomUUID() })],
    ["platform_update_plan", () => ({ p_org: randomUUID(), p_plan: "gold", p_student_limit: 10 })],
    ["platform_set_status", () => ({ p_org: randomUUID(), p_status: "active" })],
    ["platform_set_note", () => ({ p_org: randomUUID(), p_note: "x" })],
    ["platform_account_owner", () => ({ p_org: randomUUID() })],
    ["platform_log_invite", () => ({ p_org: randomUUID() })],
    ["platform_record_payment", () => ({ p_org: randomUUID(), p_paid_on: "2026-11-01", p_amount_cents: 1, p_period_start: "2026-11-01", p_period_end: "2026-11-02", p_note: "" })],
    ["platform_create_account", () => ({ p_user_id: randomUUID(), p_org_name: "X Y", p_owner_name: "X Y", p_plan: "pro", p_student_limit: 1 })],
    ["get_my_subscription", () => ({})],
  ];

  it.each(forbidden)("%s falha para o aluno", async (fn, args) => {
    await expect(rpc(student.client, fn, args())).rejects.toThrow(/FORBIDDEN|STUDENT_NOT_FOUND|SESSION_NOT_FOUND/);
  });

  it("nada mudou depois das tentativas", async () => {
    const { data } = await fx.db.from("students").select("first_name, status, access_expires_at, deleted_at").eq("id", studentId).single();
    expect(data!.first_name).not.toBe("Hack");
    expect(data!.status).toBe("active");
    expect(data!.access_expires_at).toBeNull();
    expect(data!.deleted_at).toBeNull();
    const { data: p } = await fx.db.from("pending_signups").select("status").eq("id", pendingId).single();
    expect(p!.status).toBe("pending");
    const { count } = await fx.db.from("audit_logs").select("id", { count: "exact", head: true }).eq("actor_id", student.id);
    expect(count).toBe(0);
  });

  it("consultas não revelam nada ao aluno", async () => {
    expect(await rpc<unknown[]>(student.client, "organization_plan_usage")).toHaveLength(0);
    expect(await rpc(student.client, "can_view_student_health", { p_student_id: otherId })).toBe(false);
    expect(await rpc<unknown[]>(student.client, "get_chat_messages", { p_student_id: otherId })).toHaveLength(0);
    expect(await rpc<unknown[]>(student.client, "list_chat_inbox")).toHaveLength(0);
    expect(await rpc(student.client, "staff_total_unread_count")).toBe(0);
  });

  it("funções do titular (intencionais) só enxergam o próprio cadastro", async () => {
    expect(await rpc<unknown[]>(student.client, "get_my_health_consent_request")).toHaveLength(0);
    await expect(rpc(student.client, "respond_my_health_consent", { p_accept: true })).rejects.toThrow("STUDENT_NOT_FOUND");
  });

  it.each([
    "hard_delete_student", "soft_delete_student", "update_student", "reactivate_student", "log_students_export",
    "regenerate_signup_token", "reject_signups", "create_student", "approve_signup", "respond_my_health_consent",
    "consume_access_link", "submit_public_signup", "get_public_signup_form", "hit_rate_limit", "student_effective_status",
    "record_red_flag_check", "record_red_flag_clearance", "plan_red_flag_pending",
    "get_my_student_profile", "get_my_active_plan", "start_workout_session", "record_pain_checkin", "log_set",
    "complete_session_item", "finish_workout_session", "get_my_workout_history", "student_session_alerts",
    "acknowledge_session_alert", "get_training_session",
    "send_chat_message", "get_chat_messages", "mark_chat_read", "chat_unread_count", "list_chat_inbox",
    "staff_total_unread_count", "get_my_announcement", "set_trainer_announcement", "get_session_summary", "reply_to_session",
    "rate_workout_session", "get_dashboard_training_stats", "get_dashboard_engagement_retention",
    "end_trainer_announcement", "set_student_modality",
    "submit_nps", "get_my_nps_prompt", "snooze_nps_prompt", "request_nps", "get_nps_summary", "get_nps_status", "send_nps_reminder",
    "save_feed_post", "delete_feed_post", "set_feed_post_pinned", "list_feed_posts", "get_my_feed", "get_my_feed_new_count",
    "mark_feed_seen", "toggle_feed_like",
    "is_platform_admin", "platform_list_accounts", "platform_account_detail", "platform_create_account", "platform_account_owner",
    "platform_log_invite", "platform_update_plan", "platform_record_payment", "platform_set_status", "platform_set_note",
    "get_my_subscription", "get_platform_support", "get_my_access_limits",
  ])("anônimo não executa %s", async (fn) => {
    const { error } = await anon().rpc(fn, {});
    expect(error).not.toBeNull();
  });

  it("student_effective_status não vaza inadimplência de outra organização", async () => {
    // Aluno da org A bloqueado por pagamento vencido além da carência.
    await fx.db.from("students").update({ block_if_overdue: true }).eq("id", otherId);
    await fx.db.from("payments").insert({ organization_id: org.id, student_id: otherId, amount_cents: 1000, due_date: spDateDaysAgo(30) });
    const { data: row } = await fx.db.from("students").select("*").eq("id", otherId).single();

    expect(await rpc(owner.client, "student_effective_status", { s: row })).toBe("blocked");
    // Owner da org B monta a mesma linha: o RLS esconde os pagamentos → não descobre nada.
    expect(await rpc(ownerB.client, "student_effective_status", { s: row })).toBe("active");
  });
});
