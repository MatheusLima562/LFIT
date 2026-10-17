import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addLocal,
  type ChatMessage,
  classifySendError,
  dayLabel,
  latestShownMessageId,
  mergeRows,
  messageKey,
  normalizeBody,
  oldestSentAt,
  pickClientMsgId,
  removeLocal,
  runWithTimeout,
  SEND_TIMEOUT_MS,
  setLocalStatus,
  staffNamesFrom,
  startsSenderRun,
  type ThreadMessage,
} from "@/features/chat/thread";

const STUDENT = "11111111-1111-1111-1111-111111111111";
const STAFF = "22222222-2222-2222-2222-222222222222";

let seq = 0;
function row(over: Partial<ChatMessage> = {}): ChatMessage {
  seq += 1;
  return {
    id: `id-${seq}`,
    organization_id: "org",
    student_id: STUDENT,
    sender_role: "student",
    sender_id: null,
    body: `mensagem ${seq}`,
    attached_item_id: null,
    attached_exercise_name: null,
    client_msg_id: `cid-${seq}`,
    created_at: `2026-10-09T12:00:${String(seq).padStart(2, "0")}.000Z`,
    ...over,
  };
}

function local(over: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    id: null,
    client_msg_id: "cid-local",
    student_id: STUDENT,
    sender_role: "student",
    sender_id: null,
    sender_first_name: null,
    body: "olá",
    attached_item_id: null,
    attached_exercise_name: null,
    created_at: "2026-10-09T13:00:00.000Z",
    status: "sending",
    ...over,
  };
}

describe("mergeRows: juntar, deduplicar e ordenar", () => {
  it("ordena por created_at mesmo chegando fora de ordem", () => {
    const a = row({ created_at: "2026-10-09T10:00:00.000Z" });
    const b = row({ created_at: "2026-10-09T09:00:00.000Z" });
    const c = row({ created_at: "2026-10-09T11:00:00.000Z" });
    const out = mergeRows(mergeRows([], [a]), [c, b]);
    expect(out.map((m) => m.id)).toEqual([b.id, a.id, c.id]);
  });

  it("desempata pelo id quando o horário é igual", () => {
    const x = row({ id: "b", created_at: "2026-10-09T10:00:00.000Z" });
    const y = row({ id: "a", created_at: "2026-10-09T10:00:00.000Z" });
    expect(mergeRows([], [x, y]).map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("a mesma linha vinda duas vezes (recarga + Realtime) aparece uma vez só", () => {
    const a = row();
    const out = mergeRows(mergeRows([], [a]), [{ ...a }]);
    expect(out).toHaveLength(1);
  });

  it("mensagem local é substituída pela linha do banco com o mesmo client_msg_id — chegue antes o retorno ou o Realtime", () => {
    const sending = addLocal([], local());
    const server = row({ client_msg_id: "cid-local", body: "olá" });
    const viaRealtime = mergeRows(sending, [server]);
    expect(viaRealtime).toHaveLength(1);
    expect(viaRealtime[0]).toMatchObject({ id: server.id, status: "sent" });
    // O retorno do RPC chega depois do Realtime: continua uma só.
    expect(mergeRows(viaRealtime, [server])).toHaveLength(1);
  });

  it("o mesmo client_msg_id de remetentes diferentes (aluno × professor) não colide", () => {
    const fromStudent = row({ client_msg_id: "same" });
    const fromStaff = row({ client_msg_id: "same", sender_role: "staff", sender_id: STAFF });
    expect(mergeRows([], [fromStudent, fromStaff])).toHaveLength(2);
    expect(messageKey(fromStudent as unknown as ThreadMessage)).not.toBe(messageKey(fromStaff as unknown as ThreadMessage));
  });

  it("envios locais ficam sempre no fim; confirmadas vêm antes, em ordem", () => {
    const early = row({ created_at: "2026-10-09T08:00:00.000Z" });
    const withLocal = addLocal(mergeRows([], [early]), local({ created_at: "2026-10-09T07:00:00.000Z" }));
    const later = row({ created_at: "2026-10-09T09:00:00.000Z" });
    const out = mergeRows(withLocal, [later]);
    expect(out.map((m) => m.status)).toEqual(["sent", "sent", "sending"]);
  });
});

describe("envio local: falha, reenvio e edição", () => {
  it("falha de rede marca como não enviada; reenvio volta a 'sending' com a mesma chave", () => {
    const l = local();
    const key = messageKey(l);
    const failed = setLocalStatus(addLocal([], l), key, "failed");
    expect(failed[0].status).toBe("failed");
    const again = addLocal(failed, l);
    expect(again).toHaveLength(1);
    expect(again[0].status).toBe("sending");
  });

  it("não rebaixa uma mensagem já confirmada", () => {
    const server = row({ client_msg_id: "cid-local", body: "olá" });
    const sent = mergeRows([], [server]);
    expect(addLocal(sent, local())).toEqual(sent);
    expect(setLocalStatus(sent, messageKey(sent[0]), "failed")[0].status).toBe("sent");
    expect(removeLocal(sent, messageKey(sent[0]))).toHaveLength(1);
  });

  it("editar tira a não enviada da lista", () => {
    const l = local();
    const list = setLocalStatus(addLocal([], l), messageKey(l), "failed");
    expect(removeLocal(list, messageKey(l))).toEqual([]);
  });
});

describe("pickClientMsgId: reenvio reusa o id, edição gera outro", () => {
  const gen = () => "novo";
  const last = { clientMsgId: "antigo", body: "oi", attachedItemId: null };
  it("sem tentativa anterior → id novo", () => expect(pickClientMsgId(null, "oi", null, gen)).toBe("novo"));
  it("mesmo texto e mesmo anexo → mesmo id", () => expect(pickClientMsgId(last, "oi", null, gen)).toBe("antigo"));
  it("texto editado → id novo", () => expect(pickClientMsgId(last, "oi!", null, gen)).toBe("novo"));
  it("anexo trocado → id novo", () => expect(pickClientMsgId(last, "oi", "item-1", gen)).toBe("novo"));
});

describe("normalizeBody e classifySendError", () => {
  it("tira espaços das pontas e corta em 2000", () => {
    expect(normalizeBody("  oi  ")).toBe("oi");
    expect(normalizeBody("x".repeat(2500))).toHaveLength(2000);
  });
  it("RATE_LIMITED do banco → mensagem amigável", () => expect(classifySendError({ code: "P0001", message: "RATE_LIMITED" })).toBe("rate_limited"));
  it("sem resposta do servidor → rede", () => {
    expect(classifySendError({ message: "TypeError: Failed to fetch" })).toBe("network");
    expect(classifySendError({ code: "", message: "Load failed" })).toBe("network");
  });
  it("outra recusa do banco → outra", () => expect(classifySendError({ code: "P0002", message: "STUDENT_NOT_FOUND" })).toBe("other"));
});

describe("dayLabel (São Paulo) e cursor de mensagens anteriores", () => {
  const now = new Date("2026-10-09T15:00:00.000Z"); // 12h em SP
  it("hoje, ontem e data", () => {
    expect(dayLabel("2026-10-09T13:00:00.000Z", now)).toBe("Hoje");
    expect(dayLabel("2026-10-08T20:00:00.000Z", now)).toBe("Ontem");
    expect(dayLabel("2026-10-01T12:00:00.000Z", now)).toBe("01/10/2026");
  });
  it("virada do dia em SP, não em UTC: 01:30 UTC de 09/10 ainda é 08/10 em SP", () => {
    expect(dayLabel("2026-10-09T01:30:00.000Z", now)).toBe("Ontem");
  });
  it("oldestSentAt ignora envios locais", () => {
    const a = row({ created_at: "2026-10-09T08:00:00.000Z" });
    expect(oldestSentAt(addLocal([], local()))).toBeNull();
    expect(oldestSentAt(addLocal(mergeRows([], [a]), local()))).toBe(a.created_at);
  });
});

describe("runWithTimeout: o envio nunca fica pendente", () => {
  afterEach(() => vi.useRealTimers());

  it("sem resposta em 15 s: aborta a requisição e devolve erro de rede (vira 'Não enviada')", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const pending = runWithTimeout<{ id: string }>((s) => {
      signal = s;
      return new Promise(() => {});
    });
    await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS - 1);
    expect(signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const out = await pending;
    expect(signal!.aborted).toBe(true);
    expect(out.data).toBeNull();
    expect(classifySendError(out.error)).toBe("network");
  });

  it("resposta a tempo passa direto e não aborta", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const out = await runWithTimeout(async (s) => {
      signal = s;
      return { data: { id: "x" }, error: null };
    });
    expect(out).toEqual({ data: { id: "x" }, error: null });
    await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS * 2);
    expect(signal!.aborted).toBe(false);
  });

  it("recusa do banco a tempo continua sendo recusa (não vira rede)", async () => {
    const out = await runWithTimeout(async () => ({ data: null, error: { code: "P0001", message: "RATE_LIMITED" } }));
    expect(classifySendError(out.error)).toBe("rate_limited");
  });

  it("exceção (inclusive síncrona) vira erro de rede, nunca rejeição pendurada", async () => {
    const thrown = await runWithTimeout(() => {
      throw new TypeError("crypto.randomUUID is not a function");
    });
    expect(classifySendError(thrown.error)).toBe("network");
    const rejected = await runWithTimeout(() => Promise.reject(new TypeError("Load failed")));
    expect(classifySendError(rejected.error)).toBe("network");
  });
});

describe("reenvio depois de falha usa o MESMO client_msg_id", () => {
  afterEach(() => vi.useRealTimers());

  it("timeout → bolha 'Não enviada' → 'Tentar de novo' com o mesmo id e a mesma chave (a RPC idempotente não duplica)", async () => {
    vi.useFakeTimers();
    let n = 0;
    const gen = () => `id-${++n}`;
    const clientMsgId = pickClientMsgId(null, "oi", null, gen);
    const attempt = { clientMsgId, body: "oi", attachedItemId: null };
    const l = local({ client_msg_id: clientMsgId, body: "oi" });

    const pending = runWithTimeout<ChatMessage>(() => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS);
    const out = await pending;
    expect(classifySendError(out.error)).toBe("network");
    const failed = setLocalStatus(addLocal([], l), messageKey(l), "failed");
    expect(failed[0].status).toBe("failed");

    // Reenviar o mesmo texto (pelo botão ou digitando igual) reusa o id; a linha gravada substitui a bolha.
    expect(pickClientMsgId(attempt, "oi", null, gen)).toBe(clientMsgId);
    const retried = addLocal(failed, l);
    expect(retried).toHaveLength(1);
    expect(retried[0]).toMatchObject({ client_msg_id: clientMsgId, status: "sending" });
    const saved = mergeRows(retried, [row({ client_msg_id: clientMsgId, body: "oi" })]);
    expect(saved).toHaveLength(1);
    expect(saved[0].status).toBe("sent");
    expect(n).toBe(1);
  });
});

describe("leitura só até a mensagem exibida", () => {
  it("latestShownMessageId: a última confirmada, ignorando envios locais sem id", () => {
    const a = row({ created_at: "2026-10-09T10:00:00.000Z" });
    const b = row({ created_at: "2026-10-09T10:00:01.000Z" });
    const list = addLocal(mergeRows([], [b, a]), local());
    expect(list.at(-1)?.status).toBe("sending");
    expect(latestShownMessageId(list)).toBe(b.id);
    expect(latestShownMessageId([])).toBeNull();
    expect(latestShownMessageId([local()])).toBeNull();
  });

  it("empate de created_at: a 'última' segue a mesma ordem (created_at, id) do banco", () => {
    const ts = "2026-10-09T10:00:00.000000Z";
    const x = row({ id: "aaaaaaaa-0000-0000-0000-000000000000", created_at: ts });
    const y = row({ id: "bbbbbbbb-0000-0000-0000-000000000000", created_at: ts });
    expect(latestShownMessageId(mergeRows([], [y, x]))).toBe(y.id);
  });
});

describe("primeiro nome de quem enviou (staff)", () => {
  it("fromRow guarda o nome só nas mensagens do staff", () => {
    const list = mergeRows([], [
      row({ sender_role: "staff", sender_id: STAFF, sender_first_name: "Rafael" }),
      row({ sender_role: "student", sender_first_name: "Não deveria" }),
    ]);
    expect(list.map((m) => m.sender_first_name)).toEqual(["Rafael", null]);
  });

  it("a mesma mensagem vinda do Realtime (sem nome) não apaga o nome já conhecido", () => {
    const withName = row({ sender_role: "staff", sender_id: STAFF, sender_first_name: "Rafael" });
    const { sender_first_name: _omit, ...fromRealtime } = withName;
    void _omit;
    const list = mergeRows(mergeRows([], [withName]), [fromRealtime]);
    expect(list).toHaveLength(1);
    expect(list[0].sender_first_name).toBe("Rafael");
  });

  it("staffNamesFrom: nome por remetente, para mensagens novas do Realtime", () => {
    const list = mergeRows([], [
      row({ sender_role: "staff", sender_id: STAFF, sender_first_name: "Rafael" }),
      row({ sender_role: "staff", sender_id: STAFF }),
    ]);
    expect(staffNamesFrom(list).get(STAFF)).toBe("Rafael");
  });

  it("startsSenderRun: rótulo quando muda o remetente (aluno ↔ staff, ou outro membro da equipe)", () => {
    const OTHER = "33333333-3333-3333-3333-333333333333";
    const [s1, t1, t2, o1, s2] = mergeRows([], [
      row({ created_at: "2026-10-09T10:00:00.000Z" }),
      row({ created_at: "2026-10-09T10:00:01.000Z", sender_role: "staff", sender_id: STAFF }),
      row({ created_at: "2026-10-09T10:00:02.000Z", sender_role: "staff", sender_id: STAFF }),
      row({ created_at: "2026-10-09T10:00:03.000Z", sender_role: "staff", sender_id: OTHER }),
      row({ created_at: "2026-10-09T10:00:04.000Z" }),
    ]);
    expect(startsSenderRun(undefined, s1)).toBe(true);
    expect(startsSenderRun(s1, t1)).toBe(true);
    expect(startsSenderRun(t1, t2)).toBe(false);
    expect(startsSenderRun(t2, o1)).toBe(true);
    expect(startsSenderRun(o1, s2)).toBe(true);
  });
});
