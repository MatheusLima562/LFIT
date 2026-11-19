import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, studentData, type TestOrg, type TestUser } from "./helpers";

const CLI_TIMEOUT_MS = 60_000;
/** Único projeto onde este teste pode executar SQL direto (lfit-dev). */
const LFIT_DEV_REF = "fwbpazxawtxuppuczijd";

/** Projeto vinculado ao CLI (`supabase/.temp/project-ref`); vazio se não houver vínculo. */
function linkedProjectRef(): string {
  try {
    return readFileSync(join(process.cwd(), "supabase", ".temp", "project-ref"), "utf8").trim();
  } catch {
    return "";
  }
}

/**
 * SQL no banco linkado pelo Management API, com prazo (regra 7). ANTES de executar qualquer coisa, confere que o
 * projeto vinculado é o lfit-dev; senão lança erro e o teste falha sem rodar nada.
 */
function sqlLinked(sql: string) {
  const ref = linkedProjectRef();
  if (ref !== LFIT_DEV_REF) {
    throw new Error(`Projeto vinculado não é o lfit-dev (${LFIT_DEV_REF}); recebido "${ref || "nenhum"}". Nada foi executado.`);
  }
  execFileSync(join(process.cwd(), "node_modules", ".bin", "supabase"), ["db", "query", "--linked", sql], {
    encoding: "utf8",
    cwd: process.cwd(),
    timeout: CLI_TIMEOUT_MS,
    killSignal: "SIGKILL",
  });
}

/**
 * AO VIVO (migration 20261119120000): eventos reais do treino → `live_sessions`; batimento com limite de taxa; painel só
 * para staff com acesso ao aluno, sem dado de saúde; `live_enabled` só pelo owner; retenção de 30 dias.
 * Sessões criadas direto pela secret key (os gatilhos valem para qualquer escrita).
 */
interface Board {
  enabled: boolean;
  can_configure: boolean;
  live: { session_id: string; student_id: string; done: number; total: number }[];
  attention: { kind: string; student_id: string }[];
}

describe.runIf(dbTestsEnabled)("ao vivo (get_live_board, live_heartbeat, set_live_enabled)", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, trainer: TestUser, trainer2: TestUser, studentUser: TestUser, ownerB: TestUser;
  let s1: string, sessionId: string;

  const board = (u: TestUser) => rpc<Board>(u.client, "get_live_board");
  const beat = (u: TestUser, id = sessionId) => rpc<{ accepted: boolean; live_enabled: boolean; show_notice: boolean }>(u.client, "live_heartbeat", { p_session_id: id });

  beforeAll(async () => {
    org = await fx.org("live");
    orgB = await fx.org("live-b");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer");
    trainer2 = await fx.user(org, "trainer", "t2");
    studentUser = await fx.user(org, "student", "aluno");
    ownerB = await fx.user(orgB, "owner", "ob");

    s1 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    await fx.db.from("students").update({ trainer_id: trainer.id, user_id: studentUser.id }).eq("id", s1);

    const { data, error } = await fx.db
      .from("workout_sessions")
      .insert({ organization_id: org.id, student_id: s1, workout_label: "A", snapshot: { items: [{}, {}, {}] }, status: "in_progress" })
      .select("id")
      .single();
    if (error) throw error;
    sessionId = data.id as string;
  });
  afterAll(() => fx.cleanup());

  it("iniciar o treino cria o registro ao vivo; sem batimento ainda não aparece", async () => {
    const { data } = await fx.db.from("live_sessions").select("session_id, organization_id").eq("session_id", sessionId);
    expect(data).toHaveLength(1);
    expect((await board(trainer)).live).toHaveLength(0);
  });

  it("batimento do aluno: grava uma vez a cada 30 s; aviso de transparência até ser visto", async () => {
    const first = await beat(studentUser);
    expect(first.accepted).toBe(true);
    expect(first.show_notice).toBe(true);
    expect((await beat(studentUser)).accepted).toBe(false); // limite de taxa
    await rpc(studentUser.client, "ack_live_notice");
    expect((await beat(studentUser)).show_notice).toBe(false);
  });

  it("professor responsável e owner veem; outro professor e outro tenant não", async () => {
    const b = await board(trainer);
    expect(b.live.map((e) => e.session_id)).toEqual([sessionId]);
    expect(b.live[0]).toMatchObject({ done: 0, total: 3 });
    expect((await board(owner)).live).toHaveLength(1);
    expect((await board(trainer2)).live).toHaveLength(0);
    expect((await board(ownerB)).live).toHaveLength(0);
  });

  it("RLS de live_sessions: aluno, outro professor e outro tenant não leem", async () => {
    for (const u of [studentUser, trainer2, ownerB]) {
      const { data } = await u.client.from("live_sessions").select("session_id");
      expect(data ?? []).toHaveLength(0);
    }
    const { data } = await trainer.client.from("live_sessions").select("*").eq("session_id", sessionId);
    expect(Object.keys(data![0]).sort()).toEqual(["last_event_at", "organization_id", "session_id", "student_id", "updated_at"]);
  });

  it("aluno, anônimo e quem não acessa a sessão são recusados", async () => {
    await expect(board(studentUser)).rejects.toThrow("FORBIDDEN");
    await expect(rpc(anon(), "get_live_board")).rejects.toThrow();
    await expect(beat(ownerB)).rejects.toThrow("SESSION_NOT_FOUND");
    await expect(beat(studentUser, randomUUID())).rejects.toThrow("SESSION_NOT_FOUND");
    await expect(rpc(anon(), "live_heartbeat", { p_session_id: sessionId })).rejects.toThrow();
  });

  it("sessão parada 20+ min e mensagem sem resposta 5+ min entram em 'Precisa de atenção', sem dado de saúde", async () => {
    await fx.db.from("live_sessions").update({ last_event_at: new Date(Date.now() - 25 * 60_000).toISOString() }).eq("session_id", sessionId);
    const { error: chatError } = await fx.db.from("chat_messages").insert({
      organization_id: org.id, student_id: s1, sender_role: "student", body: "canário-ao-vivo", client_msg_id: randomUUID(),
      created_at: new Date(Date.now() - 6 * 60_000).toISOString(),
    });
    expect(chatError?.message ?? null).toBeNull();
    const b = await board(trainer);
    expect(b.attention.map((a) => a.kind).sort()).toEqual(["stalled", "unanswered"]);
    const raw = JSON.stringify(b);
    expect(raw).not.toContain("canário-ao-vivo");
    expect(raw).not.toMatch(/pain_score|feedback_note|pain_checkin|body/);
  });

  it("finalizar tira do ao vivo", async () => {
    await fx.db.from("workout_sessions").update({ status: "completed", finished_at: new Date().toISOString() }).eq("id", sessionId);
    expect((await board(trainer)).live).toHaveLength(0);
  });

  it("só o owner liga/desliga; desligar apaga o acompanhamento e é auditado", async () => {
    await expect(rpc(trainer.client, "set_live_enabled", { p_enabled: false })).rejects.toThrow("FORBIDDEN");
    await expect(rpc(studentUser.client, "set_live_enabled", { p_enabled: false })).rejects.toThrow("FORBIDDEN");
    await rpc(owner.client, "set_live_enabled", { p_enabled: false });
    expect((await board(trainer)).enabled).toBe(false);
    const { data } = await fx.db.from("live_sessions").select("session_id").eq("organization_id", org.id);
    expect(data).toHaveLength(0);
    const { data: audit } = await fx.db.from("audit_logs").select("action, diff").eq("organization_id", org.id).eq("action", "live_settings_update");
    expect(audit).toEqual([{ action: "live_settings_update", diff: { live_enabled: false } }]);
    // Desligado: novas sessões não geram acompanhamento.
    const { data: s } = await fx.db
      .from("workout_sessions")
      .insert({ organization_id: org.id, student_id: s1, workout_label: "B", snapshot: {}, status: "in_progress" })
      .select("id")
      .single();
    const { data: none } = await fx.db.from("live_sessions").select("session_id").eq("session_id", s!.id);
    expect(none).toHaveLength(0);
    await rpc(owner.client, "set_live_enabled", { p_enabled: true });
  });

  it("falha no registro ao vivo NÃO impede gravar sessão, item e série", async () => {
    // Constraint temporária, só para a organização deste teste: todo insert/update em live_sessions dela falha. NOT
    // VALID não confere as linhas antigas, mas vale para as novas. Removida no finally (e só afeta a org de teste).
    // A trava do projeto roda antes do try: projeto errado → falha aqui, sem constraint criada nem removida.
    expect(linkedProjectRef(), "projeto vinculado precisa ser o lfit-dev").toBe(LFIT_DEV_REF);
    const name = `live_test_fail_${org.id.replace(/-/g, "").slice(0, 12)}`;
    sqlLinked(`alter table public.live_sessions add constraint ${name} check (organization_id <> '${org.id}') not valid;`);
    try {
      const { data: s, error: e1 } = await fx.db
        .from("workout_sessions")
        .insert({ organization_id: org.id, student_id: s1, workout_label: "F", snapshot: {}, status: "in_progress" })
        .select("id")
        .single();
      expect(e1).toBeNull();
      const { data: item, error: e2 } = await fx.db
        .from("session_item_logs")
        .insert({ organization_id: org.id, session_id: s!.id, item_id: null, exercise_name: "Teste" })
        .select("id")
        .single();
      expect(e2).toBeNull();
      const { error: e3 } = await fx.db
        .from("session_set_logs")
        .insert({ organization_id: org.id, item_log_id: item!.id, set_index: 1, quantity_value: 10 });
      expect(e3).toBeNull();
      const { error: e4 } = await fx.db.from("session_item_logs").update({ completed_at: new Date().toISOString() }).eq("id", item!.id);
      expect(e4).toBeNull();
      const { error: e5 } = await fx.db
        .from("workout_sessions")
        .update({ status: "completed", finished_at: new Date().toISOString() })
        .eq("id", s!.id);
      expect(e5).toBeNull();
      // O treino ficou gravado; o registro ao vivo, não.
      const { data: done } = await fx.db.from("workout_sessions").select("status").eq("id", s!.id).single();
      expect(done!.status).toBe("completed");
      const { data: live } = await fx.db.from("live_sessions").select("session_id").eq("session_id", s!.id);
      expect(live).toHaveLength(0);
    } finally {
      sqlLinked(`alter table public.live_sessions drop constraint if exists ${name};`);
    }
  }, CLI_TIMEOUT_MS * 3);

  it("retenção: registros com mais de 30 dias são apagados (só servidor)", async () => {
    const { data: s } = await fx.db
      .from("workout_sessions")
      .insert({ organization_id: org.id, student_id: s1, workout_label: "C", snapshot: {}, status: "in_progress" })
      .select("id")
      .single();
    await fx.db.from("live_sessions").update({ last_event_at: new Date(Date.now() - 31 * 86_400_000).toISOString() }).eq("session_id", s!.id);
    await expect(rpc(owner.client, "admin_purge_live_tracking")).rejects.toThrow();
    expect(await rpc<number>(fx.db, "admin_purge_live_tracking")).toBeGreaterThanOrEqual(1);
    const { data } = await fx.db.from("live_sessions").select("session_id").eq("session_id", s!.id);
    expect(data).toHaveLength(0);
    // A sessão de treino (histórico) continua.
    const { data: kept } = await fx.db.from("workout_sessions").select("id").eq("id", s!.id);
    expect(kept).toHaveLength(1);
  });
});
