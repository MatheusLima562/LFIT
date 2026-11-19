import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbTestsEnabled, Fixture, rpc, studentData, type TestOrg, type TestUser } from "./helpers";

/**
 * Correções da rodada anterior (migration 20261119150000):
 * A1 — "Mensagem sem resposta" no AO VIVO não some depois de 24 h: fica até o professor responder (máximo 14 dias).
 * A2 — Conversa do Assistente de IA em ordem determinística (`ai_messages.seq`): pergunta sempre antes da resposta de
 *      segurança gravada no mesmo instante, no painel, no histórico do professor e no contexto do provedor.
 */
interface Board {
  attention: { kind: string; student_id: string }[];
  unanswered_max_days: number;
}
interface StateMsg { id: string; seq: number; role: string; kind: string; body: string }

describe.runIf(dbTestsEnabled)("correções: mensagem sem resposta (A1) e ordem da conversa da IA (A2)", () => {
  const fx = new Fixture();
  let org: TestOrg;
  let owner: TestUser, trainer: TestUser, studentUser: TestUser;
  let s1: string;
  const itemId = randomUUID();

  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const DAY = 86_400_000;
  const chat = async (sender_role: "student" | "staff", created_at: string, sender_id: string | null = null) => {
    const { error } = await fx.db.from("chat_messages").insert({
      organization_id: org.id, student_id: s1, sender_role, sender_id, body: "canário-a1", client_msg_id: randomUUID(), created_at,
    });
    expect(error?.message ?? null).toBeNull();
  };
  const unanswered = async () => (await rpc<Board>(trainer.client, "get_live_board")).attention.filter((a) => a.kind === "unanswered" && a.student_id === s1);
  const newSession = async () => {
    const { data, error } = await fx.db
      .from("workout_sessions")
      .insert({
        organization_id: org.id, student_id: s1, workout_label: "A", status: "in_progress",
        snapshot: { items: [{ id: itemId, sets: 3, quantity_unit: "reps", quantity_min: 8, quantity_max: 12, exercise: { name: "Remada" } }] },
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  };
  const submit = (sid: string, body: string) =>
    rpc<{ status: string; message_id?: string; history?: { role: string; body: string }[] }>(studentUser.client, "ai_submit_message", { p_session_id: sid, p_item_id: itemId, p_body: body });
  const stateMsgs = async (sid: string) => (await rpc<{ messages: StateMsg[] }>(studentUser.client, "get_ai_assistant_state", { p_session_id: sid })).messages;

  beforeAll(async () => {
    org = await fx.org("fix-a");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer");
    studentUser = await fx.user(org, "student", "aluno");
    s1 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    await fx.db.from("students").update({ trainer_id: trainer.id, user_id: studentUser.id }).eq("id", s1);
  });
  afterAll(() => fx.cleanup());

  describe("A1 — mensagem sem resposta", () => {
    it("mensagem do aluno de 3 dias atrás, sem resposta, continua em 'Precisa de atenção'", async () => {
      await chat("student", ago(3 * DAY));
      expect(await unanswered()).toHaveLength(1);
      expect((await rpc<Board>(trainer.client, "get_live_board")).unanswered_max_days).toBe(14);
    });

    it("some quando o professor responde", async () => {
      await chat("staff", ago(2 * 3_600_000), trainer.id); // resposta 2 h atrás, depois da mensagem de 3 dias
      expect(await unanswered()).toHaveLength(0);
    });

    it("volta com nova mensagem do aluno (5+ min) e não depende de 24 h", async () => {
      await chat("student", ago(30 * 60 * 60_000)); // 30 h: mais antiga que a resposta
      expect(await unanswered()).toHaveLength(0); // a resposta do professor (2 h atrás) é a mais recente
      await chat("student", ago(10 * 60_000));
      expect(await unanswered()).toHaveLength(1);
    });

    it("limite de 14 dias: sem nada mais recente, mensagem de 15 dias não aparece", async () => {
      await fx.db.from("chat_messages").delete().eq("student_id", s1);
      await chat("student", ago(15 * DAY));
      expect(await unanswered()).toHaveLength(0);
      await chat("student", ago(13 * DAY));
      expect(await unanswered()).toHaveLength(1);
    });

    it("no AO VIVO não aparece o texto da mensagem", async () => {
      expect(JSON.stringify(await rpc(trainer.client, "get_live_board"))).not.toContain("canário-a1");
    });
  });

  describe("App do aluno — nome do personal no lugar de 'coordenação/equipe do estúdio'", () => {
    type Profile = { trainer_name: string | null; owner_first_name: string | null; personal_name: string | null };
    const profile = async () => (await rpc<Profile[]>(studentUser.client, "get_my_student_profile"))[0];

    it("com professor da equipe designado: o primeiro nome dele; o do personal também vem (quem vê a conversa)", async () => {
      await fx.db.from("profiles").update({ full_name: "Rafaela Dona Exemplo" }).eq("id", owner.id);
      await fx.db.from("profiles").update({ full_name: "Caio Professor" }).eq("id", trainer.id);
      expect(await profile()).toMatchObject({ trainer_name: "Caio Professor", personal_name: "Caio", owner_first_name: "Rafaela" });
    });

    it("sem professor designado: o primeiro nome do personal (dono da conta)", async () => {
      await fx.db.from("students").update({ trainer_id: null }).eq("id", s1);
      expect(await profile()).toMatchObject({ trainer_name: null, personal_name: "Rafaela", owner_first_name: "Rafaela" });
    });

    it("nunca o sobrenome", async () => {
      try {
        expect(JSON.stringify(await profile())).not.toMatch(/Dona Exemplo/);
      } finally {
        await fx.db.from("students").update({ trainer_id: trainer.id }).eq("id", s1);
      }
    });

    it("sem nome nenhum (conta sem perfil de personal e aluno sem professor) → nulo; a tela usa 'seu personal'", async () => {
      // O banco não aceita nome em branco (CHECK de 2 a 120 caracteres): o único caso sem nome é não haver owner.
      expect((await fx.db.from("profiles").update({ full_name: "   " }).eq("id", owner.id)).error).not.toBeNull();
      const lone = await fx.org("fix-a-sem-dono");
      const loneUser = await fx.user(lone, "student", "sozinho");
      const { error } = await fx.db.from("students").insert({
        organization_id: lone.id, first_name: "Só", last_name: "Aluno", email: `so-${randomUUID().slice(0, 6)}@example.com`,
        enrollment_number: 1, user_id: loneUser.id,
      });
      expect(error?.message ?? null).toBeNull();
      const [p] = await rpc<Profile[]>(loneUser.client, "get_my_student_profile");
      expect(p).toMatchObject({ trainer_name: null, personal_name: null, owner_first_name: null });
    });
  });

  describe("A2 — ordem da conversa com a IA", () => {
    beforeAll(async () => {
      await fx.db.from("organizations").update({ ai_assistant_enabled: true }).eq("id", org.id);
      const st = await rpc<{ consent_version: string }>(studentUser.client, "get_ai_assistant_state", { p_session_id: await newSession() });
      await rpc(studentUser.client, "accept_ai_terms", { p_version: st.consent_version });
    });

    it("resposta de segurança (mesmo instante) vem SEMPRE depois da pergunta — 8 repetições", async () => {
      for (let i = 0; i < 8; i++) {
        const sid = await newSession();
        expect((await submit(sid, `senti uma pontada ${i}`)).status).toBe("safety");
        const msgs = await stateMsgs(sid);
        expect(msgs.map((m) => m.role)).toEqual(["student", "assistant"]);
        expect(msgs[1].kind).toBe("safety");
        expect(msgs[1].seq).toBeGreaterThan(msgs[0].seq);
        // Mesmo instante de verdade (a ordem não depende do relógio).
        const { data } = await fx.db.from("ai_messages").select("created_at").eq("session_id", sid);
        expect(new Set(data!.map((r) => r.created_at)).size).toBe(1);
      }
    });

    it("histórico do professor (select ordenado por seq) e painel na mesma ordem", async () => {
      const sid = await newSession();
      const a = await submit(sid, "como respiro?");
      await rpc(fx.db, "ai_record_reply", { p_message_id: a.message_id, p_body: "Solte o ar na subida.", p_input_tokens: 1, p_output_tokens: 1, p_failed: false });
      expect((await submit(sid, "e a pegada?")).status).toBe("ok");
      const panel = (await stateMsgs(sid)).map((m) => m.body);
      expect(panel).toEqual(["como respiro?", "Solte o ar na subida.", "e a pegada?"]);
      const { data } = await trainer.client.from("ai_messages").select("body, seq").eq("session_id", sid).order("seq");
      expect(data!.map((r) => r.body)).toEqual(panel);
    });

    it("contexto enviado ao provedor: histórico em ordem de gravação, sem a pergunta atual", async () => {
      const sid = await newSession();
      const a = await submit(sid, "primeira");
      await rpc(fx.db, "ai_record_reply", { p_message_id: a.message_id, p_body: "resposta 1", p_input_tokens: 1, p_output_tokens: 1, p_failed: false });
      const b = await submit(sid, "segunda");
      expect(b.history).toEqual([{ role: "student", body: "primeira" }, { role: "assistant", body: "resposta 1" }]);
    });

    it("`seq` é só do banco: nem a secret key escolhe o valor", async () => {
      const sid = await newSession();
      const { error } = await fx.db.from("ai_messages").insert({
        organization_id: org.id, student_id: s1, session_id: sid, role: "student", body: "x", seq: 1,
      } as never);
      expect(error).not.toBeNull();
    });
  });
});
