import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, spDateDaysAgo, studentData, type TestOrg, type TestUser } from "./helpers";

type Row = Record<string, unknown>;
type Plan = { planId: string; wA: string; itemA: string };

/** Como spDateDaysAgo, mas devolve o timestamptz completo ao meio-dia UTC (não meia-noite) — meia-noite UTC
 * cai no dia anterior em America/Sao_Paulo (UTC-3) e quebraria mês/semana calculados em SP. */
function spNoonIso(n: number) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

describe.runIf(dbTestsEnabled)("App humanizado: chat, recados, resumo e resposta ao feedback", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, owner2: TestUser, trainer: TestUser, trainer2: TestUser;
  let studentUser: TestUser, otherUser: TestUser, noTrainerUser: TestUser, ownerB: TestUser;
  let s1: string, s2: string, s3: string; // s3: sem professor (trainer_id nulo) — só o owner acessa
  const plans = new Map<string, Plan>();
  const ex: Record<string, string> = {};

  const globalEx = async (name: string) =>
    (await fx.db.from("exercises").select("id").is("organization_id", null).eq("name", name).single()).data!.id as string;
  const item = (exercise: string, extra: Row = {}) => ({ exercise_id: exercise, sets: 1, quantity_unit: "reps", quantity_min: 10, quantity_max: 10, ...extra });

  /** Cria e ativa um plano mínimo (uma divisão "A", um item) para o aluno; devolve os ids de divisão e item. */
  const makePlan = async (studentId: string, creator: TestUser): Promise<Plan> => {
    const planId = await rpc<string>(creator.client, "save_training_plan", {
      p_plan: { student_id: studentId, name: "Plano Chat", starts_on: spDateDaysAgo(300), ends_on: spDateDaysAgo(-300), workouts: [{ label: "A", items: [item(ex.supra)] }] },
    });
    expect(await rpc(creator.client, "activate_plan", { p_plan_id: planId })).toBe("active");
    const { data: w } = await fx.db.from("plan_workouts").select("id").eq("plan_id", planId).eq("label", "A").single();
    const { data: i } = await fx.db.from("plan_workout_items").select("id").eq("workout_id", w!.id).single();
    const plan = { planId, wA: w!.id, itemA: i!.id };
    plans.set(studentId, plan);
    return plan;
  };

  /** Fecha uma sessão concluída com uma carga para `ex.supra`, com `started_at` forçado (histórico de PR/streak). */
  const completedSession = async (studentId: string, startedAtIso: string, load: number, unit: "kg" | "lb" = "kg") => {
    const { planId, wA, itemA } = plans.get(studentId)!;
    const [st] = await rpc<{ session_id: string }[]>(owner.client, "start_workout_session", { p_plan_id: planId, p_workout_id: wA, p_student_id: studentId });
    await rpc(owner.client, "log_set", { p_session_id: st.session_id, p_item_id: itemA, p_set_index: 1, p_data: { quantity_value: 10, load_value: load, load_unit: unit } });
    await rpc(owner.client, "complete_session_item", { p_session_id: st.session_id, p_item_id: itemA, p_pain_score: null });
    await rpc(owner.client, "finish_workout_session", { p_session_id: st.session_id });
    await fx.db.from("workout_sessions").update({ started_at: startedAtIso }).eq("id", st.session_id);
    return st.session_id;
  };

  beforeAll(async () => {
    org = await fx.org("chat");
    orgB = await fx.org("chat-b");
    owner = await fx.user(org, "owner", "o1");
    owner2 = await fx.user(org, "owner", "o2"); // segundo owner — get_my_announcement não pode quebrar com >1; também usado para não somar no limite de envio do owner principal
    trainer = await fx.user(org, "trainer", "t1");
    trainer2 = await fx.user(org, "trainer", "t2");
    studentUser = await fx.user(org, "student", "aluno");
    otherUser = await fx.user(org, "student", "outro");
    noTrainerUser = await fx.user(org, "student", "semprof");
    ownerB = await fx.user(orgB, "owner");

    s1 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    s2 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    s3 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    await fx.db.from("students").update({ trainer_id: trainer.id, user_id: studentUser.id }).eq("id", s1);
    await fx.db.from("students").update({ trainer_id: trainer.id, user_id: otherUser.id }).eq("id", s2);
    await fx.db.from("students").update({ trainer_id: null, user_id: noTrainerUser.id }).eq("id", s3);

    ex.supra = await globalEx("Abdominal supra");
    await makePlan(s1, trainer);
    await makePlan(s2, trainer);
    await makePlan(s3, owner); // sem professor responsável: só o owner tem acesso para criar/ativar
  });
  afterAll(() => fx.cleanup());

  it("chat: aluno, responsável e owner acessam; professor do plano sem acesso ao aluno não vê nada (tudo-ou-nada)", async () => {
    const m1 = await rpc<Row>(studentUser.client, "send_chat_message", { p_client_msg_id: randomUUID(), p_student_id: s1, p_body: "Oi, professor!" });
    expect(m1).toMatchObject({ sender_role: "student", sender_id: null, student_id: s1 });
    const m2 = await rpc<Row>(trainer.client, "send_chat_message", { p_client_msg_id: randomUUID(), p_student_id: s1, p_body: "Oi! Tudo bem?" });
    expect(m2).toMatchObject({ sender_role: "staff", sender_id: trainer.id });
    const m3 = await rpc<Row>(owner.client, "send_chat_message", { p_client_msg_id: randomUUID(), p_student_id: s1, p_body: "Owner também vê" });
    expect(m3).toMatchObject({ sender_role: "staff", sender_id: owner.id });

    const asStudent = await rpc<Row[]>(studentUser.client, "get_chat_messages", { p_student_id: s1 });
    expect(asStudent).toHaveLength(3);

    // trainer2: sem acesso nenhum ao aluno. send_chat_message (plpgsql) recusa explicitamente; get_chat_messages
    // (sql puro) não lança — só filtra e devolve vazio, mesmo padrão de "leitura sem efeito" do projeto.
    expect(await rpc<Row[]>(trainer2.client, "get_chat_messages", { p_student_id: s1 })).toEqual([]);
    await expect(rpc(trainer2.client, "send_chat_message", { p_client_msg_id: randomUUID(), p_student_id: s1, p_body: "x" })).rejects.toThrow("STUDENT_NOT_FOUND");

    // trainer2 vira professor do plano (sem acesso ao cadastro/saúde) — ainda assim, sem chat (diferente da escada dos alertas).
    const { planId, wA, itemA } = plans.get(s1)!;
    await rpc(trainer.client, "save_training_plan", {
      p_plan: { id: planId, student_id: s1, name: "Plano Chat", starts_on: spDateDaysAgo(300), ends_on: spDateDaysAgo(-300), trainer_id: trainer2.id, workouts: [{ id: wA, label: "A", items: [{ id: itemA, ...item(ex.supra) }] }] },
    });
    expect(await rpc<Row[]>(trainer2.client, "get_chat_messages", { p_student_id: s1 })).toEqual([]);
    await rpc(trainer.client, "save_training_plan", {
      p_plan: { id: planId, student_id: s1, name: "Plano Chat", starts_on: spDateDaysAgo(300), ends_on: spDateDaysAgo(-300), trainer_id: trainer.id, workouts: [{ id: wA, label: "A", items: [{ id: itemA, ...item(ex.supra) }] }] },
    });

    // outro aluno e anônimo.
    expect(await rpc<Row[]>(otherUser.client, "get_chat_messages", { p_student_id: s1 })).toEqual([]);
    await expect(rpc(anon(), "get_chat_messages", { p_student_id: s1 })).rejects.toThrow();
  });

  it("isolamento entre organizações: ownerB não acessa nada de s1 (chat, recado, resumo, feedback) nem lê as tabelas direto", async () => {
    expect(await rpc<Row[]>(ownerB.client, "get_chat_messages", { p_student_id: s1 })).toEqual([]);
    await expect(rpc(ownerB.client, "send_chat_message", { p_client_msg_id: randomUUID(), p_student_id: s1, p_body: "x" })).rejects.toThrow("STUDENT_NOT_FOUND");
    expect(await rpc<Row[]>(ownerB.client, "list_chat_inbox")).toEqual([]);
    await expect(rpc(ownerB.client, "get_my_announcement", { p_student_id: s1 })).rejects.toThrow("STUDENT_NOT_FOUND");

    const sid = await completedSession(s1, spNoonIso(250), 1); // sessão qualquer, longe do mês/semana atuais
    await expect(rpc(ownerB.client, "get_session_summary", { p_session_id: sid })).rejects.toThrow("SESSION_NOT_FOUND");
    await expect(rpc(ownerB.client, "reply_to_session", { p_session_id: sid, p_reply: "x" })).rejects.toThrow("SESSION_NOT_FOUND");

    expect((await ownerB.client.from("chat_messages").select("id")).data).toEqual([]);
    expect((await ownerB.client.from("chat_reads").select("student_id")).data).toEqual([]);
    expect((await ownerB.client.from("trainer_announcements").select("id")).data).toEqual([]);
  });

  it("escrita direta é recusada: chat, recados e coach_reply só por RPC (sem grant de insert/update/delete)", async () => {
    for (const client of [studentUser.client, trainer.client, owner.client]) {
      // Linha completa (com client_msg_id): a recusa tem de vir da falta de grant, não de coluna faltando.
      const direct = await client.from("chat_messages").insert({ organization_id: org.id, student_id: s1, sender_role: "staff", sender_id: owner.id, body: "x", client_msg_id: randomUUID() });
      expect(direct.error?.code).toBe("42501");
      expect((await client.from("chat_reads").insert({ student_id: s1, reader_role: "staff", reader_id: owner.id })).error).not.toBeNull();
      expect((await client.from("trainer_announcements").insert({ organization_id: org.id, trainer_id: owner.id, body: "x" })).error).not.toBeNull();
      expect((await client.from("workout_sessions").update({ coach_reply: "x" }).eq("student_id", s1)).error).not.toBeNull();
    }
  });

  it("anexo: só item do plano ATIVO do aluno; recusa item de outro aluno", async () => {
    const { itemA } = plans.get(s1)!;
    const ok = await rpc<Row>(studentUser.client, "send_chat_message", { p_client_msg_id: randomUUID(), p_student_id: s1, p_body: "Olha esse exercício", p_attached_item_id: itemA });
    expect(ok).toMatchObject({ attached_item_id: itemA, attached_exercise_name: "Abdominal supra" });
    await expect(
      rpc(studentUser.client, "send_chat_message", { p_client_msg_id: randomUUID(), p_student_id: s1, p_body: "x", p_attached_item_id: plans.get(s2)!.itemA }),
    ).rejects.toThrow("INVALID_INPUT");
  });

  it("corpo vazio ou só espaço é recusado antes de gravar", async () => {
    await expect(rpc(studentUser.client, "send_chat_message", { p_client_msg_id: randomUUID(), p_student_id: s1, p_body: "   " })).rejects.toThrow("INVALID_INPUT");
    await expect(rpc(studentUser.client, "send_chat_message", { p_client_msg_id: randomUUID(), p_student_id: s1, p_body: "" })).rejects.toThrow("INVALID_INPUT");
  });

  it("get_chat_messages pagina com p_before", async () => {
    const page1 = await rpc<Row[]>(studentUser.client, "get_chat_messages", { p_student_id: s1 });
    expect(page1.length).toBeGreaterThan(0);
    const oldest = page1[page1.length - 1];
    const page2 = await rpc<Row[]>(studentUser.client, "get_chat_messages", { p_student_id: s1, p_before: oldest.created_at });
    expect(page2.every((m) => (m.created_at as string) < (oldest.created_at as string))).toBe(true);
  });

  it("limite de 30 mensagens/minuto: aluno contado por student_id (sender_id nulo); staff somando alunos diferentes", async () => {
    for (let i = 0; i < 30; i++) await rpc(otherUser.client, "send_chat_message", { p_client_msg_id: randomUUID(), p_student_id: s2, p_body: `m${i}` });
    await expect(rpc(otherUser.client, "send_chat_message", { p_client_msg_id: randomUUID(), p_student_id: s2, p_body: "31ª" })).rejects.toThrow("RATE_LIMITED");
    // O limite é por aluno (student_id), não global: s1 continua liberado.
    await rpc(studentUser.client, "send_chat_message", { p_client_msg_id: randomUUID(), p_student_id: s1, p_body: "s1 não é afetado pelo limite de s2" });

    // owner2 (não owner — que já enviou 1 mensagem no primeiro teste e estouraria o total em 1) testa o limite do lado staff.
    for (let i = 0; i < 14; i++) await rpc(owner2.client, "send_chat_message", { p_client_msg_id: randomUUID(), p_student_id: s1, p_body: `o${i}` });
    for (let i = 0; i < 15; i++) await rpc(owner2.client, "send_chat_message", { p_client_msg_id: randomUUID(), p_student_id: s3, p_body: `o${i}` });
    // 29 do owner2 no último minuto, somando as duas conversas — a 30ª ainda passa, a 31ª não.
    await rpc(owner2.client, "send_chat_message", { p_client_msg_id: randomUUID(), p_student_id: s1, p_body: "30ª do owner2" });
    await expect(rpc(owner2.client, "send_chat_message", { p_client_msg_id: randomUUID(), p_student_id: s3, p_body: "31ª do owner2" })).rejects.toThrow("RATE_LIMITED");
    // Outro remetente (trainer) não é afetado pelo limite do owner2.
    await rpc(trainer.client, "send_chat_message", { p_client_msg_id: randomUUID(), p_student_id: s1, p_body: "trainer não é afetado" });
  });

  it("cursores de leitura independentes: o owner marcar como lido não muda o não lido do professor responsável", async () => {
    await rpc(studentUser.client, "send_chat_message", { p_client_msg_id: randomUUID(), p_student_id: s1, p_body: "mensagem nova para contagem" });
    const unreadOwnerBefore = await rpc<number>(owner.client, "chat_unread_count", { p_student_id: s1 });
    const unreadTrainerBefore = await rpc<number>(trainer.client, "chat_unread_count", { p_student_id: s1 });
    expect(unreadOwnerBefore).toBeGreaterThan(0);
    expect(unreadTrainerBefore).toBeGreaterThan(0);

    await rpc(owner.client, "mark_chat_read", { p_student_id: s1 });
    expect(await rpc<number>(owner.client, "chat_unread_count", { p_student_id: s1 })).toBe(0);
    expect(await rpc<number>(trainer.client, "chat_unread_count", { p_student_id: s1 })).toBe(unreadTrainerBefore);

    await rpc(trainer.client, "mark_chat_read", { p_student_id: s1 });
    expect(await rpc<number>(trainer.client, "chat_unread_count", { p_student_id: s1 })).toBe(0);

    // Lado do aluno: cursor único.
    await rpc(trainer.client, "send_chat_message", { p_client_msg_id: randomUUID(), p_student_id: s1, p_body: "resposta do professor" });
    expect(await rpc<number>(studentUser.client, "chat_unread_count", { p_student_id: s1 })).toBeGreaterThan(0);
    await rpc(studentUser.client, "mark_chat_read", { p_student_id: s1 });
    expect(await rpc<number>(studentUser.client, "chat_unread_count", { p_student_id: s1 })).toBe(0);
  });

  it("list_chat_inbox: não lidas primeiro, inclui aluno sem mensagem; staff_total_unread_count soma tudo; aluno não vê a caixa", async () => {
    await rpc(owner.client, "mark_chat_read", { p_student_id: s1 });
    await rpc(owner.client, "mark_chat_read", { p_student_id: s3 });
    await rpc(studentUser.client, "send_chat_message", { p_client_msg_id: randomUUID(), p_student_id: s1, p_body: "não lida para o owner" });
    // Aluno novo, sem mensagem nenhuma (s2 já tem 30 do teste de limite) — prova que a caixa inclui quem nunca escreveu.
    const s4 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;

    const inbox = await rpc<Row[]>(owner.client, "list_chat_inbox");
    const byId = new Map(inbox.map((r) => [r.student_id as string, r]));
    expect(byId.get(s1)).toMatchObject({ unread_count: 1 });
    expect(byId.has(s4)).toBe(true);
    expect((byId.get(s4) as Row).last_message).toBeNull();
    expect(inbox[0].student_id).toBe(s1); // não lida primeiro

    const total = await rpc<number>(owner.client, "staff_total_unread_count");
    expect(total).toBeGreaterThanOrEqual(1);
    // trainer2 (sem acesso a nenhum aluno) não vê ninguém na caixa.
    expect(await rpc<Row[]>(trainer2.client, "list_chat_inbox")).toEqual([]);
    // A caixa é do staff: o aluno não vê conversas de outros (devolve vazio, não é erro).
    expect(await rpc<Row[]>(studentUser.client, "list_chat_inbox")).toEqual([]);
  });

  it("recado do professor: por aluno específico não vaza; broadcast só para os alunos do próprio professor; expira; 2 owners não quebra", async () => {
    await rpc(trainer.client, "set_trainer_announcement", { p_body: "Treino de amanhã remarcado", p_student_id: s1 });
    const forS1 = await rpc<Row>(studentUser.client, "get_my_announcement", {});
    expect(forS1.body).toBe("Treino de amanhã remarcado");
    const forS2 = await rpc<Row>(otherUser.client, "get_my_announcement", {});
    expect(forS2.id).toBeNull(); // não vaza para outro aluno do mesmo professor

    await rpc(trainer.client, "set_trainer_announcement", { p_body: "Recado para todo mundo do professor" });
    expect((await rpc<Row>(otherUser.client, "get_my_announcement", {})).body).toBe("Recado para todo mundo do professor");

    // Aluno sem professor (trainer_id nulo): cai no recado do owner — dois owners na org, não pode estourar "more than one row".
    await rpc(owner.client, "set_trainer_announcement", { p_body: "Recado do owner para quem não tem professor" });
    const forS3 = await rpc<Row>(noTrainerUser.client, "get_my_announcement", {});
    expect(forS3.body).toBe("Recado do owner para quem não tem professor");

    const id = await rpc<string>(trainer.client, "set_trainer_announcement", { p_body: "Vai expirar", p_student_id: s1 });
    await fx.db.from("trainer_announcements").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", id);
    // O recado mais recente (mas expirado) some; o aluno vê o próximo mais recente ainda válido — o broadcast do
    // professor ("Recado para todo mundo"), criado depois do específico "Treino de amanhã remarcado".
    expect((await rpc<Row>(studentUser.client, "get_my_announcement", {})).body).toBe("Recado para todo mundo do professor");

    await expect(rpc(studentUser.client, "set_trainer_announcement", { p_body: "x" })).rejects.toThrow(/FORBIDDEN/);
    await expect(rpc(trainer.client, "set_trainer_announcement", { p_body: "   " })).rejects.toThrow("INVALID_INPUT");
  });

  it("get_session_summary: PR só com carga anterior (sessão concluída ANTERIOR), não mistura unidade, ignora exercício sem carga", async () => {
    // Primeira vez no exercício: sem histórico, nunca é recorde.
    const first = await completedSession(s2, spNoonIso(20), 20, "kg");
    const sum1 = await rpc<{ records: Row[] }>(owner.client, "get_session_summary", { p_session_id: first });
    expect(sum1.records).toEqual([expect.objectContaining({ exercise_name: "Abdominal supra", prior_best: null, is_pr: false })]);

    // Sessão posterior com carga maior: bate o recorde.
    const second = await completedSession(s2, spNoonIso(10), 25, "kg");
    const sum2 = await rpc<{ records: Row[] }>(owner.client, "get_session_summary", { p_session_id: second });
    expect(sum2.records).toEqual([expect.objectContaining({ prior_best: 20, best_load_now: 25, is_pr: true })]);

    // Sessão com carga MENOR: não é recorde, mas prior_best reflete o histórico (25).
    const third = await completedSession(s2, spNoonIso(5), 22, "kg");
    const sum3 = await rpc<{ records: Row[] }>(owner.client, "get_session_summary", { p_session_id: third });
    expect(sum3.records).toEqual([expect.objectContaining({ prior_best: 25, best_load_now: 22, is_pr: false })]);

    // Unidade diferente (lb): não compara com o histórico em kg — sem "prior" em lb, não é recorde por engano.
    const lbSession = await completedSession(s2, spNoonIso(2), 90, "lb");
    const sumLb = await rpc<{ records: Row[] }>(owner.client, "get_session_summary", { p_session_id: lbSession });
    expect(sumLb.records).toEqual([expect.objectContaining({ prior_best: null, best_load_now: 90, is_pr: false })]);

    // Cronológico: a sessão em lb, registrada DEPOIS, não "contamina" o prior_best de uma sessão anterior em kg.
    const sumThirdAgain = await rpc<{ records: Row[] }>(owner.client, "get_session_summary", { p_session_id: third });
    expect(sumThirdAgain.records[0].prior_best).toBe(25); // continua 25 (de "second"), não 22 nem 90

    // Exercício sem carga numérica (ex.: contado só por repetições) não aparece em "records".
    const { planId, wA, itemA } = plans.get(s2)!;
    const [stNoLoad] = await rpc<{ session_id: string }[]>(owner.client, "start_workout_session", { p_plan_id: planId, p_workout_id: wA, p_student_id: s2 });
    await rpc(owner.client, "log_set", { p_session_id: stNoLoad.session_id, p_item_id: itemA, p_set_index: 1, p_data: { quantity_value: 10 } });
    await rpc(owner.client, "complete_session_item", { p_session_id: stNoLoad.session_id, p_item_id: itemA, p_pain_score: null });
    await rpc(owner.client, "finish_workout_session", { p_session_id: stNoLoad.session_id });
    const sumNoLoad = await rpc<{ records: Row[] }>(owner.client, "get_session_summary", { p_session_id: stNoLoad.session_id });
    expect(sumNoLoad.records).toEqual([]);
  });

  it("reply_to_session: exige can_access_student, recusa texto vazio, aparece no histórico do aluno", async () => {
    const sid = await completedSession(s1, spNoonIso(1), 30, "kg");
    await expect(rpc(trainer2.client, "reply_to_session", { p_session_id: sid, p_reply: "Boa!" })).rejects.toThrow("SESSION_NOT_FOUND");
    await expect(rpc(trainer.client, "reply_to_session", { p_session_id: sid, p_reply: "   " })).rejects.toThrow("INVALID_INPUT");
    await rpc(trainer.client, "reply_to_session", { p_session_id: sid, p_reply: "Mandou bem!" });
    const history = await rpc<Row[]>(studentUser.client, "get_my_workout_history", {});
    expect(history.find((h) => h.session_id === sid)).toMatchObject({ coach_reply: "Mandou bem!" });
  });

  it("conteúdo do chat e da resposta ao feedback nunca aparece em audit_logs", async () => {
    const marker = `segredo-${randomUUID()}`;
    await rpc(studentUser.client, "send_chat_message", { p_client_msg_id: randomUUID(), p_student_id: s1, p_body: `mensagem ${marker}` });
    const sid = await completedSession(s1, spNoonIso(240), 5); // data longe do mês/semana testados em outro caso
    await rpc(trainer.client, "reply_to_session", { p_session_id: sid, p_reply: `resposta ${marker}` });
    const { data } = await fx.db.from("audit_logs").select("diff").eq("organization_id", org.id);
    expect((data ?? []).some((row) => JSON.stringify(row.diff ?? {}).includes(marker))).toBe(false);
  });

  it("get_my_student_profile: horário do professor, sessões do mês e sequência de semanas (quebra se parou há 2 meses)", async () => {
    await fx.db.from("profiles").update({ preferences: { office_hours: "Seg–sex, 8h–20h" } }).eq("id", trainer.id);
    const [p0] = await rpc<Row[]>(studentUser.client, "get_my_student_profile");
    expect(p0).toMatchObject({ trainer_office_hours: "Seg–sex, 8h–20h" });

    await completedSession(s1, spNoonIso(0), 30); // sessão concluída hoje
    const [p1] = await rpc<Row[]>(studentUser.client, "get_my_student_profile");
    expect(p1.sessions_this_month).toBeGreaterThanOrEqual(1);
    expect(p1.week_streak as number).toBeGreaterThanOrEqual(1); // semana atual conta

    // Sequência de 3 semanas seguidas, mas terminando há ~2 meses: não conta mais (quebrou — regra do dono).
    await completedSession(s3, spNoonIso(70), 10);
    await completedSession(s3, spNoonIso(63), 10);
    await completedSession(s3, spNoonIso(56), 10);
    const [p3] = await rpc<Row[]>(noTrainerUser.client, "get_my_student_profile");
    expect(p3.week_streak).toBe(0);
  });

  it("envio idempotente: reenvio com o mesmo client_msg_id devolve a mesma linha, sem duplicar nem contar no limite", async () => {
    // Remetentes novos, para não herdar contagem do teste de limite.
    const idemUser = await fx.user(org, "student", "idem");
    const idemOwner = await fx.user(org, "owner", "idem-o");
    const s5 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    await fx.db.from("students").update({ user_id: idemUser.id }).eq("id", s5);
    const count = async (cid: string) =>
      (await fx.db.from("chat_messages").select("id", { count: "exact", head: true }).eq("client_msg_id", cid)).count;

    // Sem client_msg_id é recusado.
    await expect(rpc(idemUser.client, "send_chat_message", { p_client_msg_id: null, p_student_id: s5, p_body: "x" })).rejects.toThrow("INVALID_INPUT");

    // Reenvio (aluno): mesma linha, uma só no banco.
    const cid = randomUUID();
    const a = await rpc<Row>(idemUser.client, "send_chat_message", { p_client_msg_id: cid, p_student_id: s5, p_body: "reenvio" });
    const b = await rpc<Row>(idemUser.client, "send_chat_message", { p_client_msg_id: cid, p_student_id: s5, p_body: "reenvio" });
    expect(b.id).toBe(a.id);
    expect(await count(cid)).toBe(1);

    // Mesmo id com outro texto: erro do cliente, nunca uma segunda mensagem.
    await expect(rpc(idemUser.client, "send_chat_message", { p_client_msg_id: cid, p_student_id: s5, p_body: "outro texto" })).rejects.toThrow("INVALID_INPUT");
    expect(await count(cid)).toBe(1);

    // Único POR REMETENTE: o professor pode usar o mesmo uuid na mesma conversa sem colidir com o aluno.
    const st = await rpc<Row>(idemOwner.client, "send_chat_message", { p_client_msg_id: cid, p_student_id: s5, p_body: "reenvio" });
    expect(st.id).not.toBe(a.id);
    expect(st.sender_role).toBe("staff");
    expect(await count(cid)).toBe(2);

    // Staff: mesmo id em OUTRA conversa é recusado (único por sender_id, em todas as conversas).
    await expect(rpc(idemOwner.client, "send_chat_message", { p_client_msg_id: cid, p_student_id: s1, p_body: "reenvio" })).rejects.toThrow("INVALID_INPUT");

    // Envios simultâneos com o mesmo id: uma linha só, os dois recebem o mesmo id.
    const race = randomUUID();
    const [r1, r2] = await Promise.all([
      rpc<Row>(idemUser.client, "send_chat_message", { p_client_msg_id: race, p_student_id: s5, p_body: "corrida" }),
      rpc<Row>(idemUser.client, "send_chat_message", { p_client_msg_id: race, p_student_id: s5, p_body: "corrida" }),
    ]);
    expect(r1.id).toBe(r2.id);
    expect(await count(race)).toBe(1);

    // Limite: 2 mensagens do aluno até aqui; completa 30 com ids novos.
    for (let i = 0; i < 28; i++) await rpc(idemUser.client, "send_chat_message", { p_client_msg_id: randomUUID(), p_student_id: s5, p_body: `l${i}` });
    // No limite, o reenvio de uma já gravada ainda devolve a linha (não conta de novo)...
    const again = await rpc<Row>(idemUser.client, "send_chat_message", { p_client_msg_id: cid, p_student_id: s5, p_body: "reenvio" });
    expect(again.id).toBe(a.id);
    // ...e uma mensagem nova é recusada.
    await expect(rpc(idemUser.client, "send_chat_message", { p_client_msg_id: randomUUID(), p_student_id: s5, p_body: "31ª" })).rejects.toThrow("RATE_LIMITED");
  });

  it("segurança: anônimo não executa nenhuma RPC nova", async () => {
    for (const [fn, args] of [
      ["send_chat_message", { p_client_msg_id: randomUUID(), p_student_id: s1, p_body: "x" }],
      ["get_chat_messages", { p_student_id: s1 }],
      ["mark_chat_read", { p_student_id: s1 }],
      ["chat_unread_count", { p_student_id: s1 }],
      ["list_chat_inbox", {}],
      ["staff_total_unread_count", {}],
      ["get_my_announcement", {}],
      ["set_trainer_announcement", { p_body: "x" }],
      ["get_session_summary", { p_session_id: s1 }],
      ["reply_to_session", { p_session_id: s1, p_reply: "x" }],
    ] as const) {
      const { error } = await anon().rpc(fn, args);
      expect(error, fn).not.toBeNull();
    }
  });
});
