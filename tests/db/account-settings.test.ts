import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, studentData, type TestOrg, type TestUser } from "./helpers";

/**
 * Configurações (1.3, migration 20261120130000): perfil, negócio (só owner), bucket privado `org-branding`, marca no app
 * do aluno e na tela do convite, exportação da conta sem saúde salvo opt-in, somente leitura respeitado.
 */
describe.runIf(dbTestsEnabled)("configurações do personal", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, trainer: TestUser, studentUser: TestUser, ownerB: TestUser, studentB: TestUser;
  let s1: string;
  const uploaded: string[] = [];
  const blob = () => new Blob([new Uint8Array([82, 73, 70, 70])], { type: "image/webp" });
  const up = async (u: TestUser, path: string) => {
    const { error } = await u.client.storage.from("org-branding").upload(path, blob(), { contentType: "image/webp" });
    if (!error) uploaded.push(path);
    return error;
  };
  const canSign = async (u: TestUser, path: string) => !(await u.client.storage.from("org-branding").createSignedUrl(path, 60)).error;

  beforeAll(async () => {
    org = await fx.org("cfg");
    orgB = await fx.org("cfg-b");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer");
    studentUser = await fx.user(org, "student", "aluno");
    ownerB = await fx.user(orgB, "owner", "ob");
    studentB = await fx.user(orgB, "student", "ab");
    s1 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData({ notes: "OBS-SAUDE-CANARIO" }) })).id;
    await fx.db.from("students").update({ trainer_id: trainer.id, user_id: studentUser.id, health_data_consent_at: new Date().toISOString() }).eq("id", s1);
    const g = await fx.group(org, "Dor na Coluna (teste)");
    await fx.db.from("student_groups").insert({ student_id: s1, group_id: g, organization_id: org.id });
    const sB = (await rpc<{ id: string }>(ownerB.client, "create_student", { p_data: studentData() })).id;
    await fx.db.from("students").update({ user_id: studentB.id }).eq("id", sB);
    await fx.db.from("workout_sessions").insert({
      organization_id: org.id, student_id: s1, workout_label: "A", snapshot: {}, status: "completed",
      finished_at: new Date().toISOString(), rpe: 7, feedback_note: "COMENTARIO-CANARIO", pain_checkin: "ainda_incomoda",
    });
  });
  afterAll(async () => {
    if (uploaded.length) await fx.db.storage.from("org-branding").remove(uploaded);
    await fx.cleanup();
  });

  it("logo: só o owner envia; aluno da org lê; outra org não lê; bucket privado", async () => {
    const logo = `${org.id}/logo-${randomUUID()}.webp`;
    expect(await up(trainer, `${org.id}/logo-${randomUUID()}.webp`)).not.toBeNull();
    expect(await up(ownerB, `${org.id}/logo-${randomUUID()}.webp`)).not.toBeNull();
    expect(await up(owner, logo)).toBeNull();
    expect(await canSign(studentUser, logo)).toBe(true);
    expect(await canSign(trainer, logo)).toBe(true);
    expect(await canSign(studentB, logo)).toBe(false);
    expect(await canSign(ownerB, logo)).toBe(false);
    const { data } = fx.db.storage.from("org-branding").getPublicUrl(logo);
    expect((await fetch(data.publicUrl)).ok).toBe(false);

    await expect(rpc(trainer.client, "update_organization_profile", { p_name: "Hack", p_logo_path: logo, p_contact_whatsapp: "" })).rejects.toThrow("FORBIDDEN");
    await expect(rpc(owner.client, "update_organization_profile", { p_name: "Studio", p_logo_path: `${org.id}/logo-${randomUUID()}.webp`, p_contact_whatsapp: "" })).rejects.toThrow("INVALID_INPUT");
    await expect(rpc(owner.client, "update_organization_profile", { p_name: "Studio", p_logo_path: "", p_contact_whatsapp: "4199" })).rejects.toThrow("INVALID_INPUT");
    await rpc(owner.client, "update_organization_profile", { p_name: "Studio Cfg", p_logo_path: logo, p_contact_whatsapp: "+5541999010287" });
    expect(await rpc(studentUser.client, "get_my_branding")).toEqual({ name: "Studio Cfg", logo_path: logo, contact_whatsapp: "+5541999010287" });
    expect(await rpc(trainer.client, "get_my_branding")).toMatchObject({ name: "Studio Cfg" });
    expect(await rpc(studentB.client, "get_my_branding")).not.toMatchObject({ name: "Studio Cfg" });
    const { data: audit } = await fx.db.from("audit_logs").select("diff").eq("organization_id", org.id).eq("action", "organization.profile_updated");
    expect(JSON.stringify(audit)).not.toContain("5541999010287");
  });

  it("foto: cada um envia e salva só a própria", async () => {
    const mine = `${org.id}/avatar-${trainer.id}-${randomUUID()}.webp`;
    expect(await up(trainer, `${org.id}/avatar-${owner.id}-${randomUUID()}.webp`)).not.toBeNull();
    expect(await up(trainer, mine)).toBeNull();
    await expect(rpc(owner.client, "update_my_profile", { p_full_name: "Owner Teste", p_avatar_path: mine })).rejects.toThrow("INVALID_INPUT");
    expect(await rpc(trainer.client, "update_my_profile", { p_full_name: "Bia Professora", p_avatar_path: mine })).toEqual({ previous_avatar_path: null });
    await expect(rpc(trainer.client, "update_my_profile", { p_full_name: "B", p_avatar_path: "" })).rejects.toThrow("INVALID_INPUT");
    expect(await rpc(trainer.client, "update_my_profile", { p_full_name: "Bia Professora", p_avatar_path: "" })).toEqual({ previous_avatar_path: mine });
    await expect(rpc(studentUser.client, "update_my_profile", { p_full_name: "Aluno", p_avatar_path: "" })).rejects.toThrow("FORBIDDEN");
  });

  it("tela do convite: nome do negócio só com token válido; só o servidor consulta", async () => {
    const token = await rpc<string>(owner.client, "create_access_link", { p_student_id: s1 });
    expect(await rpc(fx.db, "get_access_link_branding", { p_token: token })).toMatchObject({ name: "Studio Cfg" });
    expect(await rpc(fx.db, "get_access_link_branding", { p_token: "0".repeat(64) })).toBeNull();
    await expect(rpc(owner.client, "get_access_link_branding", { p_token: token })).rejects.toThrow();
    await expect(rpc(anon(), "get_access_link_branding", { p_token: token })).rejects.toThrow();
  });

  it("exportação: só o owner; sem saúde por padrão; com o opt-in, saúde de quem ele pode ver", async () => {
    await expect(rpc(trainer.client, "export_account_data", { p_kind: "students", p_include_health: false })).rejects.toThrow("FORBIDDEN");
    const plain = await rpc<Record<string, unknown>[]>(owner.client, "export_account_data", { p_kind: "students", p_include_health: false });
    expect(plain).toHaveLength(1);
    const rawPlain = JSON.stringify(plain);
    expect(rawPlain).not.toContain("OBS-SAUDE-CANARIO");
    expect(rawPlain).not.toContain("Dor na Coluna");
    const health = await rpc<Record<string, unknown>[]>(owner.client, "export_account_data", { p_kind: "students", p_include_health: true });
    expect(health[0]).toMatchObject({ groups: "Dor na Coluna (teste)", notes: "OBS-SAUDE-CANARIO" });

    const sess = await rpc<Record<string, unknown>[]>(owner.client, "export_account_data", { p_kind: "sessions", p_include_health: false });
    expect(sess[0]).toMatchObject({ rpe: 7, pain_checkin: null, feedback_note: null });
    const sessH = await rpc<Record<string, unknown>[]>(owner.client, "export_account_data", { p_kind: "sessions", p_include_health: true });
    expect(sessH[0]).toMatchObject({ pain_checkin: "ainda_incomoda", feedback_note: "COMENTARIO-CANARIO" });

    await rpc(owner.client, "log_account_export", { p_kind: "students", p_count: 1, p_include_health: true });
    const { data: audit } = await fx.db.from("audit_logs").select("diff").eq("organization_id", org.id).eq("action", "account.exported");
    expect(audit).toEqual([{ diff: { kind: "students", count: 1, health: true } }]);
    // Outra organização não vê nada desta.
    expect(JSON.stringify(await rpc(ownerB.client, "export_account_data", { p_kind: "students", p_include_health: true }))).not.toContain("OBS-SAUDE-CANARIO");
  });

  it("conta em somente leitura: configurações recusadas; exportação continua (conta encerrada)", async () => {
    await fx.db.from("organizations").update({ subscription_status: "canceled", status_changed_at: new Date(Date.now() - 40 * 86_400_000).toISOString() }).eq("id", org.id);
    try {
      await expect(rpc(owner.client, "update_organization_profile", { p_name: "Outro", p_logo_path: "", p_contact_whatsapp: "" })).rejects.toThrow("ACCOUNT_READ_ONLY");
      await expect(rpc(trainer.client, "update_my_profile", { p_full_name: "Outro Nome", p_avatar_path: "" })).rejects.toThrow("ACCOUNT_READ_ONLY");
      expect(await rpc<unknown[]>(owner.client, "export_account_data", { p_kind: "sessions", p_include_health: false })).toHaveLength(1);
      await expect(rpc(owner.client, "log_account_export", { p_kind: "sessions", p_count: 1, p_include_health: false })).resolves.toBeNull();
    } finally {
      await fx.db.from("organizations").update({ subscription_status: "active" }).eq("id", org.id);
    }
  });
});
