import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, spDateDaysAgo, studentData, type TestOrg, type TestUser } from "./helpers";

describe.runIf(dbTestsEnabled)("Etapa 2.10 (Fase B): triagem de sinais de alerta e liberação (base legal própria)", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, trainer: TestUser, trainer2: TestUser, student: TestUser, ownerB: TestUser;
  let s1: string, s2: string, sNoConsent: string;

  beforeAll(async () => {
    org = await fx.org("rf");
    orgB = await fx.org("rf-b");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer", "t1");
    trainer2 = await fx.user(org, "trainer", "t2");
    student = await fx.user(org, "student");
    ownerB = await fx.user(orgB, "owner");
    s1 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    s2 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    sNoConsent = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    const declared = new Date().toISOString();
    // s1: responsável = trainer, só declarado (sem confirmação do titular). s2: do owner, confirmado.
    await fx.db.from("students").update({ trainer_id: trainer.id, health_consent_declared_at: declared, user_id: student.id }).eq("id", s1);
    await fx.db.from("students").update({ health_consent_declared_at: declared, health_data_consent_at: declared }).eq("id", s2);
  });
  afterAll(() => fx.cleanup());

  it("responsável registra sinais e encaminhamento; itens repetidos viram um só; auditoria sem os itens", async () => {
    const id = await rpc<string>(trainer.client, "record_red_flag_check", {
      p_student_id: s1,
      p_items: ["recent_trauma", "progressive_weakness", "recent_trauma"],
      p_referred: true,
      p_note: "Relatou na conversa",
    });
    const { data } = await trainer.client.from("student_red_flag_checks").select("items, referred, note, source, recorded_by").eq("id", id).single();
    expect(data).toEqual({ items: ["progressive_weakness", "recent_trauma"], referred: true, note: "Relatou na conversa", source: "trainer", recorded_by: trainer.id });
    const { data: logs } = await fx.db.from("audit_logs").select("action, entity_id, diff").eq("organization_id", org.id).eq("action", "student.red_flag_check_recorded");
    expect(logs).toEqual([{ action: "student.red_flag_check_recorded", entity_id: s1, diff: null }]);
  });

  it("owner lê e registra mesmo sem acesso aos demais dados de saúde; outro professor, professor do plano e outra org não", async () => {
    // s1: consentimento só declarado e o owner não é o responsável → não vê grupos/condições, mas vê a triagem.
    expect(await rpc(owner.client, "can_view_student_health", { p_student_id: s1 })).toBe(false);
    expect((await owner.client.from("student_red_flag_checks").select("id").eq("student_id", s1)).data).toHaveLength(1);
    await rpc(owner.client, "record_red_flag_check", { p_student_id: s1, p_items: [] });
    // Professor do plano (sem acesso ao aluno) não enxerga a triagem.
    const planId = await rpc<string>(trainer.client, "save_training_plan", {
      p_plan: { student_id: s1, name: "Plano rf", trainer_id: trainer2.id, workouts: [{ label: "A", items: [] }] },
    });
    expect((await trainer2.client.from("training_plans").select("id").eq("id", planId)).data).toHaveLength(1);
    expect((await trainer2.client.from("student_red_flag_checks").select("id")).data).toHaveLength(0);
    // Outro professor não acessa o aluno; outra org também não.
    await expect(rpc(trainer2.client, "record_red_flag_check", { p_student_id: s1, p_items: [] })).rejects.toThrow("STUDENT_NOT_FOUND");
    await expect(rpc(ownerB.client, "record_red_flag_check", { p_student_id: s2, p_items: [] })).rejects.toThrow("STUDENT_NOT_FOUND");
    expect((await ownerB.client.from("student_red_flag_checks").select("id")).data).toHaveLength(0);
  });

  it("sem consentimento de saúde: triagem e liberação permitidas (art. 11, II, e/d); entradas inválidas recusadas", async () => {
    const id = await rpc<string>(owner.client, "record_red_flag_check", { p_student_id: sNoConsent, p_items: ["hot_swollen_joint"], p_referred: true });
    await rpc(owner.client, "record_red_flag_clearance", { p_check_id: id, p_kind: "medico", p_name: "Dr. Exemplo", p_on: spDateDaysAgo(0) });
    const { data } = await owner.client.from("student_red_flag_checks").select("referred, clearance_kind").eq("id", id).single();
    expect(data).toEqual({ referred: true, clearance_kind: "medico" });
    await expect(rpc(owner.client, "record_red_flag_check", { p_student_id: s2, p_items: ["diagnostico"] })).rejects.toThrow("INVALID_INPUT");
    await expect(rpc(owner.client, "record_red_flag_check", { p_student_id: s2, p_items: [], p_referred: true })).rejects.toThrow("INVALID_INPUT");
    // Observação acima de 300 caracteres: recusada na triagem e na liberação.
    await expect(rpc(owner.client, "record_red_flag_check", { p_student_id: s2, p_items: [], p_note: "a".repeat(301) })).rejects.toThrow("INVALID_INPUT");
    const withFlag = await rpc<string>(owner.client, "record_red_flag_check", { p_student_id: sNoConsent, p_items: ["recent_trauma"], p_note: "a".repeat(300) });
    await expect(
      rpc(owner.client, "record_red_flag_clearance", { p_check_id: withFlag, p_kind: "medico", p_name: "Dr. Exemplo", p_on: spDateDaysAgo(0), p_note: "a".repeat(301) }),
    ).rejects.toThrow("INVALID_INPUT");
    await rpc(owner.client, "record_red_flag_clearance", { p_check_id: withFlag, p_kind: "medico", p_name: "Dr. Exemplo", p_on: spDateDaysAgo(0) });
    const direct = await owner.client.from("student_red_flag_checks").insert({ organization_id: org.id, student_id: s2, items: [] });
    expect(direct.error).not.toBeNull();
  });

  it("liberação: só em triagem com sinais, uma vez, data até hoje; depois o aviso sai", async () => {
    const none = await rpc<string>(owner.client, "record_red_flag_check", { p_student_id: s2, p_items: [] });
    const args = (id: string, extra: Record<string, unknown> = {}) => ({ p_check_id: id, p_kind: "medico", p_name: "Dra. Exemplo", p_on: spDateDaysAgo(0), ...extra });
    await expect(rpc(owner.client, "record_red_flag_clearance", args(none))).rejects.toThrow("INVALID_INPUT");

    const withFlags = await rpc<string>(owner.client, "record_red_flag_check", { p_student_id: s2, p_items: ["calf_swelling"] });
    await expect(rpc(owner.client, "record_red_flag_clearance", args(withFlags, { p_on: spDateDaysAgo(-1) }))).rejects.toThrow("INVALID_INPUT");
    await expect(rpc(owner.client, "record_red_flag_clearance", args(withFlags, { p_kind: "personal" }))).rejects.toThrow("INVALID_INPUT");
    await expect(rpc(student.client, "record_red_flag_clearance", args(withFlags))).rejects.toThrow(/FORBIDDEN|STUDENT_NOT_FOUND/);

    await rpc(owner.client, "record_red_flag_clearance", args(withFlags, { p_kind: "fisioterapeuta", p_note: "Liberado sem impacto" }));
    const { data } = await owner.client
      .from("student_red_flag_checks")
      .select("clearance_kind, clearance_name, clearance_on, clearance_note, clearance_recorded_by")
      .eq("id", withFlags)
      .single();
    expect(data).toEqual({ clearance_kind: "fisioterapeuta", clearance_name: "Dra. Exemplo", clearance_on: spDateDaysAgo(0), clearance_note: "Liberado sem impacto", clearance_recorded_by: owner.id });
    await expect(rpc(owner.client, "record_red_flag_clearance", args(withFlags))).rejects.toThrow("INVALID_INPUT");
    const { count } = await fx.db.from("audit_logs").select("id", { count: "exact", head: true }).eq("action", "student.red_flag_clearance_recorded").eq("entity_id", s2);
    expect(count).toBe(1);
  });

  it("aluno e anônimo não leem a triagem", async () => {
    expect((await student.client.from("student_red_flag_checks").select("id")).data ?? []).toHaveLength(0);
    expect((await anon().from("student_red_flag_checks").select("id")).data ?? []).toHaveLength(0);
    await expect(rpc(student.client, "record_red_flag_check", { p_student_id: s1, p_items: [] })).rejects.toThrow(/FORBIDDEN|STUDENT_NOT_FOUND/);
  });

  it("titular recusa o consentimento: grupos apagados, triagem e liberação mantidas (responsável e owner)", async () => {
    const group = await fx.group(org, "Grupo rf");
    await fx.db.from("student_groups").insert({ organization_id: org.id, student_id: s1, group_id: group });
    const before = (await fx.db.from("student_red_flag_checks").select("id").eq("student_id", s1)).data!.length;
    expect(before).toBeGreaterThan(0);
    await rpc(student.client, "respond_my_health_consent", { p_accept: false });
    expect((await fx.db.from("student_groups").select("group_id").eq("student_id", s1)).data).toHaveLength(0);
    expect((await fx.db.from("student_red_flag_checks").select("id").eq("student_id", s1)).data).toHaveLength(before);
    expect((await trainer.client.from("student_red_flag_checks").select("id").eq("student_id", s1)).data).toHaveLength(before);
    expect((await owner.client.from("student_red_flag_checks").select("id").eq("student_id", s1)).data).toHaveLength(before);
    // O próprio aluno continua sem acesso direto à tabela.
    expect((await student.client.from("student_red_flag_checks").select("id")).data ?? []).toHaveLength(0);
  });
});
