import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, studentData, type TestOrg, type TestUser } from "./helpers";

type Row = Record<string, unknown>;

/**
 * Chat (migration 20261016120000): mark_chat_read só até a mensagem exibida (par created_at + id, nunca para trás) e
 * sender_first_name em get_chat_messages (só o primeiro nome do staff).
 */
describe.runIf(dbTestsEnabled)("chat: leitura até a mensagem exibida e primeiro nome do remetente", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, trainer: TestUser, studentUser: TestUser, otherUser: TestUser, studentB: TestUser, ownerB: TestUser;
  let s1: string, s2: string, sB: string;

  const send = (user: TestUser, studentId: string, body: string) =>
    rpc<Row>(user.client, "send_chat_message", { p_client_msg_id: randomUUID(), p_student_id: studentId, p_body: body });
  const unread = (user: TestUser, studentId: string) => rpc<number>(user.client, "chat_unread_count", { p_student_id: studentId });
  const markUntil = (user: TestUser, studentId: string, messageId: unknown) =>
    rpc(user.client, "mark_chat_read", { p_student_id: studentId, p_until_message_id: messageId });

  beforeAll(async () => {
    org = await fx.org("chat-until");
    orgB = await fx.org("chat-until-b");
    owner = await fx.user(org, "owner", "o1");
    trainer = await fx.user(org, "trainer", "t1");
    studentUser = await fx.user(org, "student", "aluno");
    otherUser = await fx.user(org, "student", "outro");
    ownerB = await fx.user(orgB, "owner", "ob");
    studentB = await fx.user(orgB, "student", "alunob");

    s1 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    s2 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    sB = (await rpc<{ id: string }>(ownerB.client, "create_student", { p_data: studentData() })).id;
    await fx.db.from("students").update({ trainer_id: trainer.id, user_id: studentUser.id }).eq("id", s1);
    await fx.db.from("students").update({ trainer_id: trainer.id, user_id: otherUser.id }).eq("id", s2);
    await fx.db.from("students").update({ user_id: studentB.id }).eq("id", sB);
    // Nome completo com sobrenome: a RPC só pode devolver o primeiro.
    await fx.db.from("profiles").update({ full_name: "Bianca Sobrenomeoculto da Silva" }).eq("id", trainer.id);
  });
  afterAll(() => fx.cleanup());

  it("mensagem que chegou depois da exibida continua não lida", async () => {
    const shown = await send(studentUser, s1, "a primeira, exibida");
    const later = await send(studentUser, s1, "chegou depois, ainda não exibida");
    await markUntil(trainer, s1, shown.id);
    expect(await unread(trainer, s1)).toBe(1);
    await markUntil(trainer, s1, later.id);
    expect(await unread(trainer, s1)).toBe(0);
  });

  it("o cursor nunca anda para trás", async () => {
    const a = await send(studentUser, s1, "cursor a");
    const b = await send(studentUser, s1, "cursor b");
    await markUntil(owner, s1, b.id);
    expect(await unread(owner, s1)).toBe(0);
    await markUntil(owner, s1, a.id); // marcação atrasada (ex.: aba antiga) com uma mensagem anterior
    expect(await unread(owner, s1)).toBe(0);
    const { data } = await fx.db.from("chat_reads").select("last_read_message_id").eq("student_id", s1).eq("reader_id", owner.id).single();
    expect(data!.last_read_message_id).toBe(b.id);
  });

  it("empate de created_at: lê só até a mensagem exibida, na ordem (created_at, id)", async () => {
    const x = await send(studentUser, s1, "empate x");
    const y = await send(studentUser, s1, "empate y");
    // Horário do banco (o da mensagem mais recente), nunca o relógio desta máquina: ele pode estar atrás do servidor e
    // jogar o "empate" para antes de mensagens já gravadas.
    const ts = y.created_at as string;
    await fx.db.from("chat_messages").update({ created_at: ts }).in("id", [x.id as string, y.id as string]);
    const [first, second] = [x.id as string, y.id as string].sort();
    await markUntil(trainer, s1, first);
    expect(await unread(trainer, s1)).toBe(1);
    // A conversa vem na mesma ordem: a mais recente do par é a de maior id.
    const page = await rpc<Row[]>(trainer.client, "get_chat_messages", { p_student_id: s1 });
    expect(page.slice(0, 2).map((m) => m.id)).toEqual([second, first]);
    await markUntil(trainer, s1, second);
    expect(await unread(trainer, s1)).toBe(0);
  });

  it("mensagem de outra conversa, inexistente ou nula: INVALID_INPUT, sem mexer no cursor", async () => {
    const other = await send(otherUser, s2, "conversa de outro aluno");
    const before = await fx.db.from("chat_reads").select("last_read_at, last_read_message_id").eq("student_id", s1).eq("reader_id", trainer.id).single();
    await expect(markUntil(trainer, s1, other.id)).rejects.toThrow("INVALID_INPUT");
    await expect(markUntil(trainer, s1, randomUUID())).rejects.toThrow("INVALID_INPUT");
    await expect(markUntil(trainer, s1, null)).rejects.toThrow("INVALID_INPUT");
    // O aluno também não marca a própria conversa com a mensagem de outra.
    await expect(markUntil(studentUser, s1, other.id)).rejects.toThrow("INVALID_INPUT");
    const after = await fx.db.from("chat_reads").select("last_read_at, last_read_message_id").eq("student_id", s1).eq("reader_id", trainer.id).single();
    expect(after.data).toEqual(before.data);
  });

  it("sem acesso à conversa: outro tenant e anônimo são negados", async () => {
    const msg = await send(studentUser, s1, "privada");
    await expect(markUntil(studentB, s1, msg.id)).rejects.toThrow("STUDENT_NOT_FOUND");
    await expect(markUntil(ownerB, s1, msg.id)).rejects.toThrow("STUDENT_NOT_FOUND");
    await expect(markUntil(otherUser, s1, msg.id)).rejects.toThrow("STUDENT_NOT_FOUND");
    expect(await rpc<Row[]>(studentB.client, "get_chat_messages", { p_student_id: s1 })).toEqual([]);
    expect(await rpc<Row[]>(ownerB.client, "get_chat_messages", { p_student_id: s1 })).toEqual([]);
    const { error } = await anon().rpc("mark_chat_read", { p_student_id: s1, p_until_message_id: msg.id });
    expect(error).not.toBeNull();
    const { error: e2 } = await anon().rpc("get_chat_messages", { p_student_id: s1 });
    expect(e2).not.toBeNull();
    // Conversa do outro tenant continua intacta para quem é dela.
    const own = await send(studentB, sB, "do tenant B");
    await markUntil(ownerB, sB, own.id);
    expect(await unread(ownerB, sB)).toBe(0);
  });

  it("sender_first_name: só o primeiro nome do staff, nulo nas do aluno, sem vazar sobrenome/e-mail", async () => {
    await send(trainer, s1, "resposta do professor");
    await send(studentUser, s1, "obrigado");
    const page = await rpc<Row[]>(studentUser.client, "get_chat_messages", { p_student_id: s1 });
    const fromTrainer = page.find((m) => m.sender_role === "staff" && m.sender_id === trainer.id)!;
    const fromStudent = page.find((m) => m.sender_role === "student")!;
    expect(fromTrainer.sender_first_name).toBe("Bianca");
    expect(fromStudent.sender_first_name).toBeNull();
    const json = JSON.stringify(page);
    expect(json).not.toContain("Sobrenomeoculto");
    expect(json).not.toContain(trainer.email);
    expect(Object.keys(fromTrainer).sort()).toEqual(
      ["attached_exercise_name", "attached_item_id", "body", "client_msg_id", "created_at", "id", "organization_id", "sender_first_name", "sender_id", "sender_role", "student_id"].sort(),
    );
  });

  it("nada do corpo nem do nome vai para audit_logs", async () => {
    const { data } = await fx.db.from("audit_logs").select("action, diff").eq("organization_id", org.id);
    const json = JSON.stringify(data ?? []);
    for (const needle of ["Bianca", "Sobrenomeoculto", "resposta do professor", "chegou depois", "privada"]) expect(json).not.toContain(needle);
    expect((data ?? []).some((l) => String(l.action).includes("chat"))).toBe(false);
  });
});
