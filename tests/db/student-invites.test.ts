import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, studentData, type TestOrg, type TestUser } from "./helpers";
import { CLI_TIMEOUT_MS, sqlLinked } from "./linked-sql";

/**
 * Convites dos alunos (1.4, migration 20261120140000): link de uso único de 7 dias (`access_links.kind = 'invite'`),
 * só para quem ainda não tem login, regra de acesso de sempre, limite diário por conta, status na lista.
 */
interface Invite { student_id: string; token: string; expires_at: string }
interface Status { student_id: string; status: string }

describe.runIf(dbTestsEnabled)("convites dos alunos", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, trainer: TestUser, trainer2: TestUser, studentUser: TestUser, ownerB: TestUser;
  let pre: string, pre2: string, withAccount: string, ofTrainer2: string, otherOrg: string;

  const invite = (u: TestUser, ids: string[]) => rpc<Invite[]>(u.client, "create_student_invites", { p_student_ids: ids });
  const statusOf = async (u: TestUser, id: string) =>
    (await rpc<Status[]>(u.client, "student_invite_statuses", { p_student_ids: [id] }))[0]?.status;

  beforeAll(async () => {
    org = await fx.org("inv");
    orgB = await fx.org("inv-b");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer");
    trainer2 = await fx.user(org, "trainer", "t2");
    studentUser = await fx.user(org, "student", "aluno");
    ownerB = await fx.user(orgB, "owner", "ob");
    const mk = async (u: TestUser, trainerId: string | null) => {
      const id = (await rpc<{ id: string }>(u.client, "create_student", { p_data: studentData() })).id;
      if (trainerId) await fx.db.from("students").update({ trainer_id: trainerId }).eq("id", id);
      return id;
    };
    pre = await mk(owner, trainer.id);
    pre2 = await mk(owner, trainer.id);
    withAccount = await mk(owner, trainer.id);
    await fx.db.from("students").update({ user_id: studentUser.id }).eq("id", withAccount);
    ofTrainer2 = await mk(owner, trainer2.id);
    otherOrg = await mk(ownerB, null);
  });
  afterAll(() => fx.cleanup());

  it("convite de 7 dias para aluno em pré-cadastro; status 'enviado'; só o hash no banco", async () => {
    const [i] = await invite(owner, [pre]);
    expect(i.student_id).toBe(pre);
    expect(i.token).toMatch(/^[a-f0-9]{64}$/);
    const days = (new Date(i.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    const { data } = await fx.db.from("access_links").select("kind, token_hash").eq("student_id", pre);
    expect(data).toEqual([{ kind: "invite", token_hash: expect.not.stringContaining(i.token) }]);
    expect(await statusOf(owner, pre)).toBe("sent");
    const { data: audit } = await fx.db.from("audit_logs").select("action, diff").eq("organization_id", org.id).eq("action", "student.invite_created");
    expect(JSON.stringify(audit)).not.toContain(i.token);
  });

  it("aceitar = consumir o link (uso único) → status 'aceito'; o mesmo link não serve de novo", async () => {
    const [i] = await invite(owner, [pre2]);
    const first = await rpc<unknown[]>(fx.db, "consume_access_link", { p_token: i.token });
    expect(first).toHaveLength(1);
    expect(await rpc<unknown[]>(fx.db, "consume_access_link", { p_token: i.token })).toHaveLength(0);
    expect(await statusOf(owner, pre2)).toBe("accepted");
  });

  it("convite novo invalida o anterior; vencido aparece como 'expirado'", async () => {
    const [a] = await invite(owner, [pre]);
    await invite(owner, [pre]);
    expect(await rpc<unknown[]>(fx.db, "consume_access_link", { p_token: a.token })).toHaveLength(0);
    // O convite mais recente vence (como passaria o tempo): status "expirado".
    await fx.db.from("access_links").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("student_id", pre);
    expect(await statusOf(owner, pre)).toBe("expired");
  });

  it("quem já tem login não recebe convite; regra de acesso de sempre", async () => {
    await expect(invite(owner, [withAccount])).rejects.toThrow("STUDENT_HAS_ACCOUNT");
    expect(await statusOf(owner, withAccount)).toBe("accepted");
    await expect(invite(trainer, [ofTrainer2])).rejects.toThrow("STUDENT_NOT_FOUND");
    await expect(invite(owner, [otherOrg])).rejects.toThrow("STUDENT_NOT_FOUND");
    await expect(invite(ownerB, [pre])).rejects.toThrow("STUDENT_NOT_FOUND");
    await expect(invite(studentUser, [pre])).rejects.toThrow("FORBIDDEN");
    await expect(rpc(anon(), "create_student_invites", { p_student_ids: [pre] })).rejects.toThrow();
    // Status só dos alunos que o chamador acessa.
    expect(await rpc<Status[]>(trainer.client, "student_invite_statuses", { p_student_ids: [ofTrainer2] })).toHaveLength(0);
    expect(await rpc<Status[]>(ownerB.client, "student_invite_statuses", { p_student_ids: [pre] })).toHaveLength(0);
  });

  it("limite diário por conta: o lote que passa do limite é recusado inteiro", async () => {
    sqlLinked("update private.account_rules set invite_daily_limit = 5 where id;");
    try {
      const q = await rpc<{ limit: number; used_today: number; remaining: number }>(owner.client, "get_invite_quota");
      expect(q.limit).toBe(5);
      const remaining = q.remaining;
      const extra = await Promise.all(Array.from({ length: remaining + 1 }, () => rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })));
      const ids = extra.map((e) => e.id);
      await expect(invite(owner, ids)).rejects.toThrow("INVITE_LIMIT_REACHED");
      const { count } = await fx.db.from("access_links").select("id", { count: "exact", head: true }).in("student_id", ids);
      expect(count).toBe(0);
      if (remaining > 0) await expect(invite(owner, ids.slice(0, remaining))).resolves.toHaveLength(remaining);
      expect((await rpc<{ remaining: number }>(owner.client, "get_invite_quota")).remaining).toBe(0);
      // Outra conta tem o próprio limite.
      await expect(invite(ownerB, [otherOrg])).resolves.toHaveLength(1);
    } finally {
      sqlLinked("update private.account_rules set invite_daily_limit = 100 where id;");
    }
  }, CLI_TIMEOUT_MS * 3);

  it("conta em somente leitura não gera convites", async () => {
    await fx.db.from("organizations").update({ subscription_status: "suspended" }).eq("id", orgB.id);
    try {
      await expect(invite(ownerB, [otherOrg])).rejects.toThrow("ACCOUNT_READ_ONLY");
    } finally {
      await fx.db.from("organizations").update({ subscription_status: "active" }).eq("id", orgB.id);
    }
  });
});
