import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { totpCode } from "../../scripts/totp.mts";
import { anon, dbTestsEnabled, Fixture, rpc, studentData, type TestOrg, type TestUser } from "./helpers";
import { CLI_TIMEOUT_MS, sqlLinked, uuidLiteral } from "./linked-sql";

/**
 * Plataforma (1.1) e inadimplência (1.2), migration 20261120120000.
 * - Só quem está em `private.platform_admins` (entra por SQL) usa as RPCs da plataforma; ninguém mais.
 * - O admin da plataforma não lê nenhuma tabela de aluno nem recebe dado de aluno das RPCs.
 * - Situação da assinatura → estado de acesso; somente leitura garantido no banco (ACCOUNT_READ_ONLY).
 */
describe.runIf(dbTestsEnabled)("plataforma e inadimplência", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg, adminOrg: TestOrg;
  let owner: TestUser, trainer: TestUser, studentUser: TestUser, ownerB: TestUser;
  let platform: TestUser;
  let platformAal1: SupabaseClient;
  let totpSecret: string;
  let s1: string;
  const createdOrgs: string[] = [];
  const CANARY = `Canário${randomUUID().slice(0, 6)}`;

  const setStatus = (status: string, changedDaysAgo = 0) =>
    fx.db.from("organizations").update({ subscription_status: status, status_changed_at: new Date(Date.now() - changedDaysAgo * 86_400_000).toISOString() }).eq("id", org.id);
  const sub = () => rpc<{ state: string; status: string; grace_ends_at: string | null; access_ends_at: string | null }>(owner.client, "get_my_subscription");
  const limits = () => rpc<{ state: string; personal_name: string | null }>(studentUser.client, "get_my_access_limits");
  const staffWrite = () => rpc(owner.client, "create_student", { p_data: studentData() });
  const studentWrite = () => rpc(studentUser.client, "send_chat_message", { p_student_id: s1, p_body: "oi", p_client_msg_id: randomUUID() });

  beforeAll(async () => {
    org = await fx.org("plat");
    orgB = await fx.org("plat-b");
    adminOrg = await fx.org("plat-adm");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer");
    studentUser = await fx.user(org, "student", "aluno");
    ownerB = await fx.user(orgB, "owner", "ob");
    // Admin da plataforma: usuário SEM perfil em organização nenhuma (o perfil criado pela fixture é removido).
    platform = await fx.user(adminOrg, "owner", "plataforma");
    await fx.db.from("profiles").delete().eq("id", platform.id);
    sqlLinked(`insert into private.platform_admins (user_id) values (${uuidLiteral(platform.id)}) on conflict do nothing;`);
    // Sessão sem o segundo fator (aal1) — guardada antes de o mesmo usuário cadastrar e verificar o TOTP.
    platformAal1 = anon();
    const s = await platformAal1.auth.signInWithPassword({ email: platform.email, password: platform.password });
    if (s.error) throw s.error;
    // Sessão principal do admin vira aal2: cadastra o fator TOTP e verifica com o código gerado da chave.
    const { data: f, error: fe } = await platform.client.auth.mfa.enroll({ factorType: "totp", friendlyName: "teste" });
    if (fe) throw fe;
    totpSecret = f.totp.secret;
    const v = await platform.client.auth.mfa.challengeAndVerify({ factorId: f.id, code: totpCode(totpSecret) });
    if (v.error) throw v.error;

    s1 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData({ first_name: CANARY }) })).id;
    await fx.db.from("students").update({ trainer_id: trainer.id, user_id: studentUser.id }).eq("id", s1);
  }, CLI_TIMEOUT_MS * 2);

  afterAll(async () => {
    if (createdOrgs.length) await fx.db.from("organizations").delete().in("id", createdOrgs);
    await fx.cleanup();
  });

  describe("acesso à plataforma", () => {
    it("quem não está na lista não usa nenhuma RPC da plataforma (owner, professor, aluno, anônimo)", async () => {
      for (const u of [owner, trainer, studentUser]) {
        expect(await rpc(u.client, "is_platform_admin")).toBe(false);
        await expect(rpc(u.client, "platform_list_accounts")).rejects.toThrow("FORBIDDEN");
        await expect(rpc(u.client, "platform_set_status", { p_org: org.id, p_status: "suspended" })).rejects.toThrow("FORBIDDEN");
        await expect(rpc(u.client, "platform_update_plan", { p_org: org.id, p_plan: "gold", p_student_limit: 999 })).rejects.toThrow("FORBIDDEN");
        await expect(rpc(u.client, "platform_record_payment", { p_org: org.id, p_paid_on: "2026-11-01", p_amount_cents: 100, p_period_start: "2026-11-01", p_period_end: "2026-11-30", p_note: "" })).rejects.toThrow("FORBIDDEN");
      }
      await expect(rpc(anon(), "platform_list_accounts")).rejects.toThrow();
      const { data } = await fx.db.from("organizations").select("plan, subscription_status").eq("id", org.id).single();
      expect(data).toMatchObject({ plan: "free", subscription_status: "active" });
    });

    it("MFA: admin da lista SEM aal2 é recusado em toda RPC da plataforma e não fura o somente leitura", async () => {
      expect(await rpc(platformAal1, "is_platform_admin")).toBe(true);
      expect(await rpc(platformAal1, "platform_access")).toBe("mfa_required");
      await expect(rpc(platformAal1, "platform_list_accounts")).rejects.toThrow("FORBIDDEN");
      await expect(rpc(platformAal1, "platform_account_detail", { p_org: org.id })).rejects.toThrow("FORBIDDEN");
      await expect(rpc(platformAal1, "platform_set_status", { p_org: org.id, p_status: "suspended" })).rejects.toThrow("FORBIDDEN");
      await expect(rpc(platformAal1, "platform_account_owner", { p_org: org.id })).rejects.toThrow("FORBIDDEN");
      await expect(rpc(platformAal1, "platform_create_account", { p_user_id: randomUUID(), p_org_name: "X Y", p_owner_name: "X Y", p_plan: "pro", p_student_limit: 1 })).rejects.toThrow("FORBIDDEN");
      const { data } = await fx.db.from("organizations").select("subscription_status").eq("id", org.id).single();
      expect(data!.subscription_status).toBe("active");
      // Fora da lista: 'none', mesmo com sessão normal.
      expect(await rpc(owner.client, "platform_access")).toBe("none");
      // Uma nova entrada do mesmo admin começa em aal1; com o código TOTP vira aal2 e passa.
      const again = anon();
      await again.auth.signInWithPassword({ email: platform.email, password: platform.password });
      expect(await rpc(again, "platform_access")).toBe("mfa_required");
      const { data: factors } = await again.auth.mfa.listFactors();
      const factor = factors!.totp.find((f) => f.status === "verified")!;
      expect((await again.auth.mfa.challengeAndVerify({ factorId: factor.id, code: "000000" })).error).not.toBeNull();
      const ok = await again.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totpCode(totpSecret) });
      if (ok.error) {
        // O código desta janela de 30 s pode já ter sido usado no setup: espera a próxima janela e tenta de novo.
        await new Promise((r) => setTimeout(r, 30_000 - (Date.now() % 30_000) + 1_000));
        expect((await again.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totpCode(totpSecret) })).error).toBeNull();
      }
      expect(await rpc(again, "platform_access")).toBe("ok");
      await expect(rpc(again, "platform_list_accounts")).resolves.toBeTruthy();
    }, 60_000);

    it("admin vê as contas só com dados da conta (nunca nome ou contato de aluno)", async () => {
      expect(await rpc(platform.client, "is_platform_admin")).toBe(true);
      expect(await rpc(platform.client, "platform_access")).toBe("ok");
      const list = await rpc<{ id: string; seats_used: number; owner_email: string }[]>(platform.client, "platform_list_accounts");
      const mine = list.find((a) => a.id === org.id);
      expect(mine).toMatchObject({ seats_used: 1, owner_email: owner.email });
      const raw = JSON.stringify(list);
      expect(raw).not.toContain(CANARY);
      expect(raw).not.toContain(studentUser.email);
    });

    it("admin da plataforma não lê NENHUMA tabela de aluno", async () => {
      await fx.db.from("chat_messages").insert({ organization_id: org.id, student_id: s1, sender_role: "student", body: "x", client_msg_id: randomUUID() });
      for (const table of [
        "students", "students_with_status", "workout_sessions", "session_item_logs", "chat_messages", "feed_posts",
        "nps_responses", "student_groups", "special_groups", "ai_messages", "trainer_announcements", "student_red_flag_checks",
        "training_plans", "access_links", "payments",
      ]) {
        const { data } = await platform.client.from(table).select("*").limit(5);
        expect(data ?? [], table).toHaveLength(0);
      }
      await expect(rpc(platform.client, "create_student", { p_data: studentData() })).rejects.toThrow();
      expect(await rpc<unknown[]>(platform.client, "get_chat_messages", { p_student_id: s1 })).toHaveLength(0);
    });

    it("criar conta de personal: organização + owner, auditado", async () => {
      const { data: u } = await fx.db.auth.admin.createUser({ email: `lfit-test-plat-${randomUUID().slice(0, 6)}@example.com`, email_confirm: false });
      const newOrg = await rpc<string>(platform.client, "platform_create_account", {
        p_user_id: u.user!.id, p_org_name: "Studio Novo", p_owner_name: "Paula Personal", p_plan: "pro", p_student_limit: 30,
      });
      createdOrgs.push(newOrg);
      const { data: p } = await fx.db.from("profiles").select("role, organization_id").eq("id", u.user!.id).single();
      expect(p).toEqual({ role: "owner", organization_id: newOrg });
      // Mesmo usuário de novo → recusado (já tem perfil).
      await expect(rpc(platform.client, "platform_create_account", { p_user_id: u.user!.id, p_org_name: "X Y", p_owner_name: "X Y", p_plan: "pro", p_student_limit: 5 })).rejects.toThrow("INVALID_INPUT");
      const detail = await rpc<{ audit: { action: string }[] }>(platform.client, "platform_account_detail", { p_org: newOrg });
      expect(detail.audit.map((a) => a.action)).toContain("account.created");
      await fx.db.auth.admin.deleteUser(u.user!.id);
    });

    it("plano, pagamento, situação e observação: validados e auditados (observação sem o texto)", async () => {
      await rpc(platform.client, "platform_update_plan", { p_org: orgB.id, p_plan: "gold", p_student_limit: 120 });
      await expect(rpc(platform.client, "platform_update_plan", { p_org: orgB.id, p_plan: "gold", p_student_limit: 0 })).rejects.toThrow("INVALID_INPUT");
      await rpc(platform.client, "platform_record_payment", { p_org: orgB.id, p_paid_on: "2026-11-10", p_amount_cents: 9990, p_period_start: "2026-11-10", p_period_end: "2026-12-09", p_note: "Pix" });
      await expect(rpc(platform.client, "platform_record_payment", { p_org: orgB.id, p_paid_on: "2026-11-10", p_amount_cents: 9990, p_period_start: "2026-12-10", p_period_end: "2026-11-09", p_note: "" })).rejects.toThrow("INVALID_INPUT");
      await rpc(platform.client, "platform_set_note", { p_org: orgB.id, p_note: "nota-interna-secreta" });
      await expect(rpc(platform.client, "platform_set_status", { p_org: orgB.id, p_status: "nope" })).rejects.toThrow("INVALID_INPUT");
      const d = await rpc<{ note: string; payments: unknown[]; audit: { action: string; detail: unknown }[] }>(platform.client, "platform_account_detail", { p_org: orgB.id });
      expect(d.note).toBe("nota-interna-secreta");
      expect(d.payments).toHaveLength(1);
      expect(d.audit.map((a) => a.action).sort()).toEqual(["account.note_updated", "account.plan_updated", "payment.recorded"]);
      expect(JSON.stringify(d.audit)).not.toContain("nota-interna-secreta");
      // O personal não vê pagamentos nem observação da plataforma (nem por tabela, nem pela própria assinatura).
      expect(JSON.stringify(await rpc(ownerB.client, "get_my_subscription"))).not.toContain("nota-interna-secreta");
      const { data } = await fx.db.from("organizations").select("plan, student_limit").eq("id", orgB.id).single();
      expect(data).toEqual({ plan: "gold", student_limit: 120 });
    });
  });

  describe("inadimplência (regras padrão: 10 dias de tolerância, 30 dias depois de cancelar)", () => {
    afterAll(async () => {
      await setStatus("active");
    });

    it("em dia: tudo normal", async () => {
      await setStatus("active");
      expect((await sub()).state).toBe("ok");
      expect((await limits()).state).toBe("ok");
      await expect(staffWrite()).resolves.toBeTruthy();
      await expect(studentWrite()).resolves.toBeTruthy();
    });

    it("em atraso dentro da tolerância: banner (grace), gravações liberadas", async () => {
      await setStatus("past_due", 3);
      const s = await sub();
      expect(s.state).toBe("grace");
      const daysLeft = (new Date(s.grace_ends_at!).getTime() - Date.now()) / 86_400_000;
      expect(daysLeft).toBeGreaterThan(6.9);
      expect(daysLeft).toBeLessThan(7.1);
      expect((await limits()).state).toBe("ok");
      await expect(staffWrite()).resolves.toBeTruthy();
      await expect(studentWrite()).resolves.toBeTruthy();
    });

    it("em atraso depois da tolerância: somente leitura para equipe e aluno; leitura e dados intactos", async () => {
      const { count: before } = await fx.db.from("students").select("id", { count: "exact", head: true }).eq("organization_id", org.id);
      await setStatus("past_due", 11);
      expect((await sub()).state).toBe("suspended");
      expect(await limits()).toMatchObject({ state: "limited" });
      await expect(staffWrite()).rejects.toThrow("ACCOUNT_READ_ONLY");
      await expect(rpc(trainer.client, "set_trainer_announcement", { p_body: "x", p_student_id: s1 })).rejects.toThrow("ACCOUNT_READ_ONLY");
      await expect(rpc(owner.client, "save_feed_post", { p_data: { kind: "text", body: "x", audience: "all" } })).rejects.toThrow("ACCOUNT_READ_ONLY");
      await expect(studentWrite()).rejects.toThrow("ACCOUNT_READ_ONLY");
      // Leitura continua; nada foi apagado.
      const { count: after } = await owner.client.from("students").select("id", { count: "exact", head: true });
      expect(after).toBe(before);
      expect(await rpc<unknown[]>(studentUser.client, "get_chat_messages", { p_student_id: s1 })).not.toHaveLength(0);
      // Sem sessão de usuário (servidor/cron) continua gravando.
      const { error } = await fx.db.from("students").update({ notes: "ajuste do servidor" }).eq("id", s1);
      expect(error).toBeNull();
    });

    it("suspensa: igual (somente leitura)", async () => {
      await setStatus("suspended");
      expect((await sub()).state).toBe("suspended");
      expect((await limits()).state).toBe("limited");
      await expect(staffWrite()).rejects.toThrow("ACCOUNT_READ_ONLY");
      await expect(studentWrite()).rejects.toThrow("ACCOUNT_READ_ONLY");
    });

    it("cancelada há menos de 30 dias: somente leitura; aluno limitado", async () => {
      await setStatus("canceled", 5);
      const s = await sub();
      expect(s.state).toBe("canceled");
      expect(s.access_ends_at).toBeTruthy();
      expect((await limits()).state).toBe("limited");
      await expect(staffWrite()).rejects.toThrow("ACCOUNT_READ_ONLY");
    });

    it("cancelada há mais de 30 dias: encerrada; aluno sem acesso; o personal ainda lê (exportar)", async () => {
      await setStatus("canceled", 31);
      expect((await sub()).state).toBe("closed");
      expect((await limits()).state).toBe("closed");
      await expect(staffWrite()).rejects.toThrow("ACCOUNT_READ_ONLY");
      const { data } = await owner.client.from("students").select("id").eq("id", s1);
      expect(data).toHaveLength(1);
      expect(await rpc(owner.client, "log_students_export", { p_format: "csv", p_count: 1, p_filters: {} })).toBeDefined();
    });

    it("outra organização não é afetada", async () => {
      await setStatus("suspended");
      await expect(rpc(ownerB.client, "create_student", { p_data: studentData() })).resolves.toBeTruthy();
    });

    it("a situação só muda pela plataforma (equipe não grava em organizations)", async () => {
      await setStatus("past_due", 20);
      await owner.client.from("organizations").update({ subscription_status: "active" }).eq("id", org.id);
      const { data } = await fx.db.from("organizations").select("subscription_status").eq("id", org.id).single();
      expect(data!.subscription_status).toBe("past_due");
      await rpc(platform.client, "platform_set_status", { p_org: org.id, p_status: "active" });
      expect((await sub()).state).toBe("ok");
      await expect(staffWrite()).resolves.toBeTruthy();
    });
  });
});
