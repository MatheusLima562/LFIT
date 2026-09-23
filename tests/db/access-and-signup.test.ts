import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, studentData, type TestOrg, type TestUser } from "./helpers";

describe.runIf(dbTestsEnabled)("links de acesso e cadastro público", () => {
  const fx = new Fixture();
  let org: TestOrg;
  let owner: TestUser, trainer: TestUser;
  let studentId: string;

  beforeAll(async () => {
    org = await fx.org("links");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer");
    studentId = (await rpc<{ id: string }>(trainer.client, "create_student", { p_data: studentData() })).id;
  });
  afterAll(() => fx.cleanup());

  const consume = (token: string) => rpc<unknown[]>(fx.db, "consume_access_link", { p_token: token });

  describe("link de acesso (definir senha)", () => {
    it("é de uso único, invalida o anterior e só guarda o hash", async () => {
      const first = await rpc<string>(trainer.client, "create_access_link", { p_student_id: studentId });
      const second = await rpc<string>(trainer.client, "create_access_link", { p_student_id: studentId });

      const stored = await fx.db.from("access_links").select("id").eq("token_hash", second);
      expect(stored.data).toHaveLength(0);

      expect(await consume(first)).toHaveLength(0);
      expect(await consume(second)).toHaveLength(1);
      expect(await consume(second)).toHaveLength(0);
    });

    it("expira em 30 minutos", async () => {
      await rpc<string>(trainer.client, "create_access_link", { p_student_id: studentId });
      const { data } = await fx.db
        .from("access_links")
        .select("created_at, expires_at")
        .eq("student_id", studentId)
        .is("used_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      const minutes = (new Date(data!.expires_at).getTime() - new Date(data!.created_at).getTime()) / 60_000;
      expect(minutes).toBeCloseTo(30, 0);
    });

    it("só o servidor consome links", async () => {
      const token = await rpc<string>(trainer.client, "create_access_link", { p_student_id: studentId });
      const { error } = await trainer.client.rpc("consume_access_link", { p_token: token });
      expect(error).not.toBeNull();
    });
  });

  describe("cadastro por link público", () => {
    let token: string;

    beforeAll(async () => {
      const link = await rpc<{ token: string }>(owner.client, "ensure_signup_link");
      token = link.token;
    });

    it("só o owner gerencia o link", async () => {
      await expect(rpc(trainer.client, "ensure_signup_link")).rejects.toThrow("FORBIDDEN");
    });

    it("link inativo recusa envios", async () => {
      await expect(
        rpc(fx.db, "submit_public_signup", { p_token: token, p_payload: studentData(), p_consent: false }),
      ).rejects.toThrow("SIGNUP_LINK_INVALID");
    });

    it("anônimo não chama a RPC diretamente", async () => {
      const { error } = await anon().rpc("submit_public_signup", { p_token: token, p_payload: {}, p_consent: false });
      expect(error).not.toBeNull();
    });

    it("envio → pendente visível só ao owner → aprovação cria aluno", async () => {
      await owner.client.from("public_signup_links").update({ is_active: true }).eq("organization_id", org.id);
      const pendingId = await rpc<string>(fx.db, "submit_public_signup", {
        p_token: token,
        p_payload: { ...studentData(), trainer_id: trainer.id },
        p_consent: true,
      });

      const { data: pending } = await fx.db.from("pending_signups").select("payload").eq("id", pendingId).single();
      expect(pending!.payload).not.toHaveProperty("trainer_id");

      expect((await trainer.client.from("pending_signups").select("id")).data).toHaveLength(0);
      expect((await owner.client.from("pending_signups").select("id")).data).toHaveLength(1);

      const [student] = await rpc<{ source: string; trainer_id: string }[]>(owner.client, "approve_signups", {
        p_ids: [pendingId],
        p_trainer_id: trainer.id,
      });
      expect(student.source).toBe("public_link");
      expect(student.trainer_id).toBe(trainer.id);
    });

    it("recusa descarta os dados enviados", async () => {
      const pendingId = await rpc<string>(fx.db, "submit_public_signup", {
        p_token: token,
        p_payload: studentData(),
        p_consent: false,
      });
      await rpc(owner.client, "reject_signups", { p_ids: [pendingId] });
      const { data } = await fx.db.from("pending_signups").select("status, payload").eq("id", pendingId).single();
      expect(data).toEqual({ status: "rejected", payload: {} });
    });

    it("rate limit por chave", async () => {
      const key = `test:${Date.now()}`;
      const results: boolean[] = [];
      for (let i = 0; i < 4; i++) {
        results.push(await rpc<boolean>(fx.db, "hit_rate_limit", { p_key: key, p_max: 3, p_window_seconds: 60 }));
      }
      expect(results).toEqual([true, true, true, false]);
    });
  });
});
