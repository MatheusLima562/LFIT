import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, studentData, type TestOrg, type TestUser } from "./helpers";

describe.runIf(dbTestsEnabled)("Modalidade do aluno (base para o presencial)", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, trainer: TestUser, trainer2: TestUser, studentUser: TestUser, ownerB: TestUser;
  let s1: string;

  const modality = async (id: string) => (await fx.db.from("students").select("modality").eq("id", id).single()).data!.modality;

  beforeAll(async () => {
    org = await fx.org("mod");
    orgB = await fx.org("mod-b");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer", "t1");
    trainer2 = await fx.user(org, "trainer", "t2");
    studentUser = await fx.user(org, "student", "aluno");
    ownerB = await fx.user(orgB, "owner");
    s1 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    await fx.db.from("students").update({ trainer_id: trainer.id, user_id: studentUser.id }).eq("id", s1);
  });
  afterAll(() => fx.cleanup());

  it("padrão é consultoria e aparece na view students_with_status", async () => {
    expect(await modality(s1)).toBe("consultoria");
    const { data } = await trainer.client.from("students_with_status").select("modality").eq("id", s1).single();
    expect(data?.modality).toBe("consultoria");
  });

  it("professor responsável e owner alteram; valor fora da lista é recusado", async () => {
    await rpc(trainer.client, "set_student_modality", { p_student_id: s1, p_modality: "presencial" });
    expect(await modality(s1)).toBe("presencial");
    await rpc(owner.client, "set_student_modality", { p_student_id: s1, p_modality: "hibrido" });
    expect(await modality(s1)).toBe("hibrido");
    await expect(rpc(trainer.client, "set_student_modality", { p_student_id: s1, p_modality: "online" })).rejects.toThrow("INVALID_INPUT");
    await expect(rpc(trainer.client, "set_student_modality", { p_student_id: s1, p_modality: null })).rejects.toThrow("INVALID_INPUT");
    expect(await modality(s1)).toBe("hibrido");
  });

  it("professor sem acesso, outra organização, aluno e anônimo são recusados; nada muda", async () => {
    await expect(rpc(trainer2.client, "set_student_modality", { p_student_id: s1, p_modality: "consultoria" })).rejects.toThrow("STUDENT_NOT_FOUND");
    await expect(rpc(ownerB.client, "set_student_modality", { p_student_id: s1, p_modality: "consultoria" })).rejects.toThrow("STUDENT_NOT_FOUND");
    await expect(rpc(studentUser.client, "set_student_modality", { p_student_id: s1, p_modality: "consultoria" })).rejects.toThrow("STUDENT_NOT_FOUND");
    await expect(rpc(anon(), "set_student_modality", { p_student_id: s1, p_modality: "consultoria" })).rejects.toThrow();
    // Escrita direta na tabela continua sem grant.
    await studentUser.client.from("students").update({ modality: "consultoria" }).eq("id", s1);
    await trainer.client.from("students").update({ modality: "consultoria" }).eq("id", s1);
    expect(await modality(s1)).toBe("hibrido");
  });

  it("CHECK no banco: valor inválido não entra nem pelo service_role", async () => {
    const { error } = await fx.db.from("students").update({ modality: "online" }).eq("id", s1);
    expect(error).not.toBeNull();
  });
});
