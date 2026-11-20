import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbTestsEnabled, Fixture, rpc, studentData, type TestOrg, type TestUser } from "./helpers";

/**
 * 1.7 (migration 20261120170000): fuso horário por conta nos cálculos de "hoje" e retenção contando alunos arquivados
 * (antes saíam da base e a retenção ficava maior do que é).
 */
interface Eng { today: string; retention: { base_31_60: number; retained_0_30: number } }

const dayIn = (tz: string, d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);

describe.runIf(dbTestsEnabled)("fuso por conta e retenção com arquivados", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, trainer: TestUser, ownerB: TestUser;

  const eng = (u: TestUser) => rpc<Eng>(u.client, "get_dashboard_engagement_retention");
  const done = async (studentId: string, daysAgo: number) => {
    const at = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
    const { error } = await fx.db.from("workout_sessions").insert({
      organization_id: org.id, student_id: studentId, workout_label: "A", snapshot: {}, status: "completed", started_at: at, finished_at: at,
    });
    if (error) throw error;
  };

  beforeAll(async () => {
    org = await fx.org("tz");
    orgB = await fx.org("tz-b");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer");
    ownerB = await fx.user(orgB, "owner", "ob");
  });
  afterAll(() => fx.cleanup());

  it("fuso: só o owner muda, só da lista; 'hoje' das RPCs segue o fuso da conta; outra conta não muda", async () => {
    expect((await fx.db.from("organizations").select("time_zone").eq("id", org.id).single()).data!.time_zone).toBe("America/Sao_Paulo");
    expect((await eng(owner)).today).toBe(dayIn("America/Sao_Paulo"));
    await expect(rpc(trainer.client, "set_organization_time_zone", { p_time_zone: "Europe/Lisbon" })).rejects.toThrow("FORBIDDEN");
    await expect(rpc(owner.client, "set_organization_time_zone", { p_time_zone: "Asia/Tokyo" })).rejects.toThrow("INVALID_INPUT");
    await rpc(owner.client, "set_organization_time_zone", { p_time_zone: "Europe/Lisbon" });
    expect((await eng(owner)).today).toBe(dayIn("Europe/Lisbon"));
    expect((await eng(trainer)).today).toBe(dayIn("Europe/Lisbon"));
    expect((await eng(ownerB)).today).toBe(dayIn("America/Sao_Paulo"));
    // Escrita direta na coluna: sem grant/política para a equipe.
    await owner.client.from("organizations").update({ time_zone: "America/Manaus" }).eq("id", org.id);
    expect((await fx.db.from("organizations").select("time_zone").eq("id", org.id).single()).data!.time_zone).toBe("Europe/Lisbon");
    const { data: audit } = await fx.db.from("audit_logs").select("action").eq("organization_id", org.id).eq("action", "organization.time_zone_updated");
    expect(audit).toHaveLength(1);
    await rpc(owner.client, "set_organization_time_zone", { p_time_zone: "America/Sao_Paulo" });
  });

  it("NPS grava o dia civil da resposta no fuso da conta", async () => {
    await rpc(owner.client, "set_organization_time_zone", { p_time_zone: "America/Noronha" });
    const s = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    const { data, error } = await fx.db.from("nps_responses").insert({ student_id: s, score: 9, submitted_at: new Date().toISOString() }).select("submitted_on").single();
    expect(error).toBeNull();
    expect(data!.submitted_on).toBe(dayIn("America/Noronha"));
    await rpc(owner.client, "set_organization_time_zone", { p_time_zone: "America/Sao_Paulo" });
  });

  it("retenção: aluno arquivado depois de treinar continua na base (como não retido); nada de nome", async () => {
    const mk = async () => {
      const id = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
      await fx.db.from("students").update({ trainer_id: trainer.id }).eq("id", id);
      return id;
    };
    const stayed = await mk(), left = await mk(), archived = await mk();
    await done(stayed, 40); await done(stayed, 5);
    await done(left, 45);
    await done(archived, 40);
    await fx.db.from("students").update({ deleted_at: new Date().toISOString() }).eq("id", archived);
    const e = await eng(owner);
    expect(e.retention).toEqual({ base_31_60: 3, retained_0_30: 1 });
    expect((await eng(trainer)).retention).toEqual({ base_31_60: 3, retained_0_30: 1 });
    expect(JSON.stringify(e)).not.toMatch(/first_name|last_name|student_name/);
    // Outra organização não conta nada desta.
    expect((await eng(ownerB)).retention).toEqual({ base_31_60: 0, retained_0_30: 0 });
  });
});
