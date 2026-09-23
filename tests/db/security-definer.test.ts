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
  ];

  it.each(forbidden)("%s falha para o aluno", async (fn, args) => {
    await expect(rpc(student.client, fn, args())).rejects.toThrow(/FORBIDDEN|STUDENT_NOT_FOUND/);
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
  });

  it("funções do titular (intencionais) só enxergam o próprio cadastro", async () => {
    expect(await rpc<unknown[]>(student.client, "get_my_health_consent_request")).toHaveLength(0);
    await expect(rpc(student.client, "respond_my_health_consent", { p_accept: true })).rejects.toThrow("STUDENT_NOT_FOUND");
  });

  it.each([
    "hard_delete_student", "soft_delete_student", "update_student", "reactivate_student", "log_students_export",
    "regenerate_signup_token", "reject_signups", "create_student", "approve_signup", "respond_my_health_consent",
    "consume_access_link", "submit_public_signup", "get_public_signup_form", "hit_rate_limit", "student_effective_status",
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
