import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbTestsEnabled, Fixture, rpc, studentData, type TestOrg, type TestUser } from "./helpers";

describe.runIf(dbTestsEnabled)("grupos especiais e turmas (1.5)", () => {
  const fx = new Fixture();
  let org: TestOrg;
  let owner: TestUser, t1: TestUser, t2: TestUser;
  let s1: string, s2: string;

  beforeAll(async () => {
    org = await fx.org("groups");
    owner = await fx.user(org, "owner");
    t1 = await fx.user(org, "trainer", "t1");
    t2 = await fx.user(org, "trainer", "t2");
    s1 = (await rpc<{ id: string }>(t1.client, "create_student", { p_data: studentData() })).id;
    s2 = (await rpc<{ id: string }>(t2.client, "create_student", { p_data: studentData() })).id;
  });
  afterAll(() => fx.cleanup());

  describe("grupos especiais", () => {
    let groupId: string;

    it("professor cria e renomeia; nome é único na organização", async () => {
      const { data, error } = await t1.client.from("special_groups").insert({ organization_id: org.id, name: "Dor no Punho" }).select("id").single();
      expect(error).toBeNull();
      groupId = data!.id;
      const dup = await t2.client.from("special_groups").insert({ organization_id: org.id, name: "dor no punho" });
      expect(dup.error?.code).toBe("23505");
      const ren = await t2.client.from("special_groups").update({ name: "Dor no Punho (LER)" }).eq("id", groupId).select("id");
      expect(ren.data).toHaveLength(1);
    });

    it("professor não exclui grupo; owner exclui e fica auditado com a contagem", async () => {
      await rpc(t1.client, "update_student", { p_student_id: s1, p_patch: { group_ids: [groupId], health_data_consent: true } });
      const denied = await t1.client.from("special_groups").delete().eq("id", groupId).select("id");
      expect(denied.data ?? []).toHaveLength(0);

      const ok = await owner.client.from("special_groups").delete().eq("id", groupId).select("id");
      expect(ok.data).toHaveLength(1);
      const { data: log } = await fx.db.from("audit_logs").select("diff").eq("action", "special_group.deleted").eq("entity_id", groupId).single();
      expect(log!.diff).toMatchObject({ students: 1 });
      const { count } = await fx.db.from("student_groups").select("student_id", { count: "exact", head: true }).eq("group_id", groupId);
      expect(count).toBe(0);
    });
  });

  describe("turmas", () => {
    let c1: string;

    it("professor cria turma só para si", async () => {
      const own = await t1.client.from("classes").insert({ organization_id: org.id, name: "Funcional T1", trainer_id: t1.id }).select("id").single();
      expect(own.error).toBeNull();
      c1 = own.data!.id;
      const other = await t1.client.from("classes").insert({ organization_id: org.id, name: "De outro", trainer_id: t2.id });
      expect(other.error?.code).toBe("42501");
    });

    it("professor não altera nem exclui turma de outro; owner pode", async () => {
      expect((await t2.client.from("classes").update({ name: "Hack" }).eq("id", c1).select("id")).data ?? []).toHaveLength(0);
      expect((await t2.client.from("classes").delete().eq("id", c1).select("id")).data ?? []).toHaveLength(0);
      expect((await owner.client.from("classes").update({ name: "Funcional (owner)" }).eq("id", c1).select("id")).data).toHaveLength(1);
    });

    it("professor inclui só os próprios alunos na própria turma", async () => {
      const mine = await t1.client.from("class_students").insert({ class_id: c1, student_id: s1, organization_id: org.id });
      expect(mine.error).toBeNull();
      const alheio = await t1.client.from("class_students").insert({ class_id: c1, student_id: s2, organization_id: org.id });
      expect(alheio.error?.code).toBe("42501");
      const outraTurma = await t2.client.from("class_students").insert({ class_id: c1, student_id: s2, organization_id: org.id });
      expect(outraTurma.error?.code).toBe("42501");
    });

    it("contagem de alunos por turma respeita o RLS", async () => {
      await owner.client.from("class_students").insert({ class_id: c1, student_id: s2, organization_id: org.id });
      const count = async (u: TestUser) =>
        ((await u.client.from("classes").select("class_students(count)").eq("id", c1).single()).data!.class_students as unknown as { count: number }[])[0].count;
      expect(await count(owner)).toBe(2);
      expect(await count(t1)).toBe(1);
    });

    it("exclusão da turma é auditada; alunos não são afetados", async () => {
      await owner.client.from("classes").delete().eq("id", c1);
      const { data: log } = await fx.db.from("audit_logs").select("diff").eq("action", "class.deleted").eq("entity_id", c1).single();
      expect(log!.diff).toMatchObject({ students: 2 });
      expect((await fx.db.from("students").select("id").in("id", [s1, s2])).data).toHaveLength(2);
    });
  });

  it("organização com grupos e turmas pode ser apagada (gatilho de auditoria não bloqueia a cascata)", async () => {
    const tmp = await fx.org("cascade");
    await fx.db.from("special_groups").insert({ organization_id: tmp.id, name: "Grupo temporário" });
    await fx.db.from("classes").insert({ organization_id: tmp.id, name: "Turma temporária" });
    const { error } = await fx.db.from("organizations").delete().eq("id", tmp.id);
    expect(error).toBeNull();
  });
});
