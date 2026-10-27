import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, studentData, type TestOrg, type TestUser } from "./helpers";

type Student = { id: string; health_consent_declared_at: string | null; health_data_consent_at: string | null };

describe.runIf(dbTestsEnabled)("consentimento em duas etapas e cadastro público", () => {
  const fx = new Fixture();
  let org: TestOrg;
  let owner: TestUser, trainer: TestUser, studentUser: TestUser, otherStudentUser: TestUser;
  let coluna: string, joelho: string;

  beforeAll(async () => {
    org = await fx.org("consent");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer");
    studentUser = await fx.user(org, "student", "aluno-a");
    otherStudentUser = await fx.user(org, "student", "aluno-b");
    coluna = await fx.group(org, "Dor na Coluna");
    joelho = await fx.group(org, "Dor no Joelho");
  });
  afterAll(() => fx.cleanup());

  const groupsSeenBy = async (user: TestUser, studentId: string) =>
    ((await user.client.from("student_groups").select("group_id").eq("student_id", studentId)).data ?? []).length;
  const link = (studentId: string, userId: string) => fx.db.from("students").update({ user_id: userId }).eq("id", studentId);

  describe("declaração do professor → confirmação do titular", () => {
    let s: Student;

    beforeAll(async () => {
      s = await rpc<Student>(trainer.client, "create_student", {
        p_data: studentData({ group_ids: [coluna], health_data_consent: true }),
      });
      await link(s.id, studentUser.id);
    });

    it("cadastro pelo professor registra só a declaração", async () => {
      const { data } = await fx.db.from("students").select("health_consent_declared_at, health_consent_declared_by, health_data_consent_at").eq("id", s.id).single();
      expect(data!.health_consent_declared_at).not.toBeNull();
      expect(data!.health_consent_declared_by).toBe(trainer.id);
      expect(data!.health_data_consent_at).toBeNull();
    });

    it("antes da confirmação, só o responsável vê os grupos", async () => {
      expect(await groupsSeenBy(trainer, s.id)).toBe(1);
      expect(await groupsSeenBy(owner, s.id)).toBe(0);
      expect(await rpc(owner.client, "can_view_student_health", { p_student_id: s.id })).toBe(false);
      expect(await rpc(trainer.client, "can_view_student_health", { p_student_id: s.id })).toBe(true);
    });

    it("owner não altera grupos que não vê (e editar outros campos preserva os grupos)", async () => {
      await expect(
        rpc(owner.client, "update_student", { p_student_id: s.id, p_patch: { group_ids: [] } }),
      ).rejects.toThrow("FORBIDDEN");
      await rpc(owner.client, "update_student", { p_student_id: s.id, p_patch: { last_name: "Renomeado" } });
      expect(await groupsSeenBy(trainer, s.id)).toBe(1);
    });

    it("o titular vê o próprio pedido de confirmação; outro aluno não", async () => {
      const [req] = await rpc<{ group_names: string[] }[]>(studentUser.client, "get_my_health_consent_request");
      expect(req.group_names).toEqual(["Dor na Coluna"]);
      expect(await rpc<unknown[]>(otherStudentUser.client, "get_my_health_consent_request")).toHaveLength(0);
      await expect(rpc(otherStudentUser.client, "respond_my_health_consent", { p_accept: true })).rejects.toThrow("STUDENT_NOT_FOUND");
    });

    it("confirmação do titular libera para o owner", async () => {
      await rpc(studentUser.client, "respond_my_health_consent", { p_accept: true });
      expect(await groupsSeenBy(owner, s.id)).toBe(1);
      expect(await rpc<unknown[]>(studentUser.client, "get_my_health_consent_request")).toHaveLength(0);
    });
  });

  it("recusa do titular apaga os dados de saúde", async () => {
    const s = await rpc<Student>(trainer.client, "create_student", {
      p_data: studentData({ group_ids: [joelho], health_data_consent: true }),
    });
    await link(s.id, otherStudentUser.id);
    await rpc(otherStudentUser.client, "respond_my_health_consent", { p_accept: false });
    expect(await groupsSeenBy(trainer, s.id)).toBe(0);
    const { data } = await fx.db.from("students").select("health_consent_declared_at").eq("id", s.id).single();
    expect(data!.health_consent_declared_at).toBeNull();
    const { data: logs } = await fx.db.from("audit_logs").select("action").eq("entity_id", s.id);
    expect(logs!.map((l) => l.action)).toContain("student.health_consent_declined");
  });

  describe("cadastro público", () => {
    let token: string;

    beforeAll(async () => {
      token = (await rpc<{ token: string }>(owner.client, "ensure_signup_link")).token;
      await owner.client.from("public_signup_links").update({ is_active: true }).eq("organization_id", org.id);
    });

    const submit = (payload: Record<string, unknown>, consent = false) =>
      rpc<string>(fx.db, "submit_public_signup", { p_token: token, p_payload: payload, p_consent: consent });

    it("formulário público só pelo servidor e sem expor grupos", async () => {
      const { error } = await anon().rpc("get_public_signup_form", { p_token: token });
      expect(error).not.toBeNull();
      const [form] = await rpc<{ organization_name: string; form_config: object }[]>(fx.db, "get_public_signup_form", { p_token: token });
      expect(JSON.stringify(form)).not.toMatch(/Dor na Coluna|group/i);
    });

    it("ignora group_ids e campos ocultos; saúde em texto exige consentimento do titular", async () => {
      await expect(submit({ ...studentData(), health_description: "Hérnia lombar" })).rejects.toThrow("HEALTH_CONSENT_REQUIRED");
      const id = await submit(
        { ...studentData(), group_ids: [coluna], training_location: "oculto", health_description: "Hérnia lombar" },
        true,
      );
      const { data } = await fx.db.from("pending_signups").select("payload, consent_at").eq("id", id).single();
      expect(data!.payload).not.toHaveProperty("group_ids");
      expect(data!.payload).not.toHaveProperty("training_location");
      expect(data!.payload).toHaveProperty("health_description", "Hérnia lombar");
      expect(data!.consent_at).not.toBeNull();
    });

    it("formatos inválidos são recusados", async () => {
      await expect(submit({ ...studentData(), sex: "X" })).rejects.toThrow("INVALID_INPUT");
      await expect(submit({ ...studentData(), whatsapp_e164: "41999" })).rejects.toThrow("INVALID_INPUT");
    });

    it("pendente não ocupa vaga; aprovação classifica grupos com consentimento do titular", async () => {
      const before = (await rpc<{ used: number }[]>(owner.client, "organization_plan_usage"))[0].used;
      const id = await submit({ ...studentData(), health_description: "Dor no joelho direito" }, true);
      expect((await rpc<{ used: number }[]>(owner.client, "organization_plan_usage"))[0].used).toBe(before);

      const st = await rpc<Student>(owner.client, "approve_signup", { p_id: id, p_trainer_id: trainer.id, p_group_ids: [joelho] });
      expect(st.health_data_consent_at).not.toBeNull();
      expect(await groupsSeenBy(owner, st.id)).toBe(1);
      expect((await rpc<{ used: number }[]>(owner.client, "organization_plan_usage"))[0].used).toBe(before + 1);

      const { data } = await fx.db.from("pending_signups").select("status, payload").eq("id", id).single();
      expect(data).toEqual({ status: "approved", payload: {} });
    });

    it("sem consentimento do titular não dá para classificar em grupos", async () => {
      const id = await submit(studentData());
      await expect(
        rpc(owner.client, "approve_signup", { p_id: id, p_group_ids: [coluna] }),
      ).rejects.toThrow("HEALTH_CONSENT_REQUIRED");
    });

    it("revogar: novo token invalida o antigo; link inativo recusa", async () => {
      const old = token;
      token = (await rpc<{ token: string }>(owner.client, "regenerate_signup_token")).token;
      expect(token).not.toBe(old);
      await expect(rpc(fx.db, "submit_public_signup", { p_token: old, p_payload: studentData(), p_consent: false })).rejects.toThrow("SIGNUP_LINK_INVALID");
      await owner.client.from("public_signup_links").update({ is_active: false }).eq("organization_id", org.id);
      await expect(submit(studentData())).rejects.toThrow("SIGNUP_LINK_INVALID");
    });
  });
});
