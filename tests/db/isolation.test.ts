import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, studentData, type TestOrg, type TestUser } from "./helpers";

type Student = { id: string; organization_id: string; trainer_id: string | null };

describe.runIf(dbTestsEnabled)("isolamento multi-tenant (RLS)", () => {
  const fx = new Fixture();
  let orgA: TestOrg, orgB: TestOrg;
  let ownerA: TestUser, trainerA1: TestUser, trainerA2: TestUser, studentA: TestUser;
  let ownerB: TestUser, trainerB1: TestUser;
  let sA1: Student, sA2: Student, sB1: Student;
  let groupA: string;

  beforeAll(async () => {
    orgA = await fx.org("a");
    orgB = await fx.org("b");
    ownerA = await fx.user(orgA, "owner");
    trainerA1 = await fx.user(orgA, "trainer", "trainer-a1");
    trainerA2 = await fx.user(orgA, "trainer", "trainer-a2");
    studentA = await fx.user(orgA, "student");
    ownerB = await fx.user(orgB, "owner");
    trainerB1 = await fx.user(orgB, "trainer", "trainer-b1");
    groupA = await fx.group(orgA, "Dor na Coluna");
    await fx.group(orgB, "Dor no Joelho");

    sA1 = await rpc(ownerA.client, "create_student", {
      p_data: studentData({ trainer_id: trainerA1.id, group_ids: [groupA], health_data_consent: true }),
    });
    sA2 = await rpc(trainerA2.client, "create_student", { p_data: studentData() });
    sB1 = await rpc(ownerB.client, "create_student", { p_data: studentData({ trainer_id: trainerB1.id }) });
  });

  afterAll(() => fx.cleanup());

  const ids = async (user: TestUser, table: string) => {
    const { data, error } = await user.client.from(table).select("*");
    if (error) throw error;
    return data as Record<string, unknown>[];
  };

  describe("leitura entre organizações", () => {
    it.each([
      "students",
      "students_with_status",
      "special_groups",
      "student_groups",
      "profiles",
      "organizations",
      "audit_logs",
    ])("owner A não vê nada da org B em %s", async (table) => {
      const rows = await ids(ownerA, table);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => (r.organization_id ?? r.id) !== orgB.id)).toBe(true);
      expect(rows.some((r) => r.id === sB1.id)).toBe(false);
    });

    it("owner B não enxerga alunos da org A", async () => {
      const rows = await ids(ownerB, "students");
      expect(rows.map((r) => r.id)).toEqual([sB1.id]);
    });
  });

  describe("leitura dentro da organização", () => {
    it("owner vê todos os alunos da org", async () => {
      const rows = await ids(ownerA, "students");
      expect(rows.map((r) => r.id).sort()).toEqual([sA1.id, sA2.id].sort());
    });

    it("trainer vê só os alunos pelos quais é responsável", async () => {
      expect((await ids(trainerA1, "students")).map((r) => r.id)).toEqual([sA1.id]);
      expect((await ids(trainerA2, "students")).map((r) => r.id)).toEqual([sA2.id]);
    });

    it("grupos especiais do aluno (dado de saúde) só para o responsável e o owner", async () => {
      expect(await ids(trainerA1, "student_groups")).toHaveLength(1);
      expect(await ids(trainerA2, "student_groups")).toHaveLength(0);
      expect(await ids(ownerA, "student_groups")).toHaveLength(1);
    });

    it("trainer não lê auditoria nem cadastros pendentes", async () => {
      expect(await ids(trainerA1, "audit_logs")).toHaveLength(0);
      expect(await ids(trainerA1, "pending_signups")).toHaveLength(0);
    });

    it("usuário aluno não vê dados de ninguém", async () => {
      expect(await ids(studentA, "students")).toHaveLength(0);
      expect(await ids(studentA, "special_groups")).toHaveLength(0);
    });

    it("tabelas internas não são legíveis", async () => {
      for (const table of ["access_links", "rate_limits", "organization_counters"]) {
        const { data } = await ownerA.client.from(table).select("*");
        expect(data ?? []).toHaveLength(0);
      }
    });
  });

  describe("anônimo", () => {
    it.each(["students", "profiles", "organizations", "special_groups", "pending_signups", "audit_logs"])(
      "sem acesso a %s",
      async (table) => {
        const { data, error } = await anon().from(table).select("*");
        expect(error?.code === "42501" || (data ?? []).length === 0).toBe(true);
      },
    );

    it("não executa RPCs", async () => {
      const { error } = await anon().rpc("create_student", { p_data: studentData() });
      expect(error).not.toBeNull();
    });
  });

  describe("escrita", () => {
    it("escrita direta em students é negada (só via RPC)", async () => {
      const upd = await ownerA.client.from("students").update({ status: "inactive" }).eq("id", sA1.id);
      expect(upd.error?.code).toBe("42501");
      const ins = await ownerA.client.from("students").insert({ ...studentData(), organization_id: orgA.id, enrollment_number: 999 });
      expect(ins.error?.code).toBe("42501");
    });

    it("owner A não altera aluno da org B", async () => {
      await expect(rpc(ownerA.client, "deactivate_student", { p_student_id: sB1.id })).rejects.toThrow("STUDENT_NOT_FOUND");
    });

    it("trainer não altera aluno de outro trainer", async () => {
      await expect(rpc(trainerA2.client, "deactivate_student", { p_student_id: sA1.id })).rejects.toThrow("STUDENT_NOT_FOUND");
      await expect(rpc(trainerA2.client, "create_access_link", { p_student_id: sA1.id })).rejects.toThrow("STUDENT_NOT_FOUND");
    });

    it("trainer não reatribui aluno", async () => {
      await expect(
        rpc(trainerA1.client, "update_student", { p_student_id: sA1.id, p_patch: { trainer_id: trainerA2.id } }),
      ).rejects.toThrow("FORBIDDEN");
    });

    it("owner não atribui professor de outra org", async () => {
      await expect(
        rpc(ownerA.client, "create_student", { p_data: studentData({ trainer_id: trainerB1.id }) }),
      ).rejects.toThrow("INVALID_TRAINER");
    });

    it("não cria grupo especial em outra org", async () => {
      const { error } = await ownerA.client.from("special_groups").insert({ organization_id: orgB.id, name: "Invasão" });
      expect(error?.code).toBe("42501");
    });

    it("não troca o próprio papel", async () => {
      const { error } = await trainerA1.client.from("profiles").update({ role: "owner" }).eq("id", trainerA1.id);
      expect(error?.code).toBe("42501");
    });

    it("não altera o perfil de outra pessoa", async () => {
      const { data } = await trainerA1.client.from("profiles").update({ full_name: "Hack" }).eq("id", ownerA.id).select();
      expect(data ?? []).toHaveLength(0);
    });

    it("storage: não envia foto para pasta de outra org nem de aluno alheio", async () => {
      const file = new Blob(["x"], { type: "image/png" });
      const other = await ownerB.client.storage.from("student-photos").upload(`${orgA.id}/${sA1.id}/a.png`, file);
      expect(other.error).not.toBeNull();
      const alheio = await trainerA2.client.storage.from("student-photos").upload(`${orgA.id}/${sA1.id}/b.png`, file);
      expect(alheio.error).not.toBeNull();
      const proprio = await trainerA1.client.storage.from("student-photos").upload(`${orgA.id}/${sA1.id}/c.png`, file);
      expect(proprio.error).toBeNull();
      await fx.db.storage.from("student-photos").remove([`${orgA.id}/${sA1.id}/c.png`]);
    });
  });
});
