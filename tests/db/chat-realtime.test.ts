import { randomUUID } from "node:crypto";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbTestsEnabled, Fixture, rpc, spDateDaysAgo, studentData, type TestOrg, type TestUser } from "./helpers";

type Row = Record<string, unknown>;

/**
 * Canal Realtime do chat com 6 clientes reais (JWT de cada um). A garantia de isolamento é o RLS de chat_messages,
 * não o filtro do canal: por isso todos assinam a tabela inteira, SEM filtro por aluno. Uma mensagem para o aluno A só
 * pode chegar a quem acessa A (o próprio A, o professor responsável e o owner).
 */
describe.runIf(dbTestsEnabled)("Chat Realtime: o canal só entrega a quem o RLS permite", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, trainer: TestUser, planTrainer: TestUser, studentA: TestUser, studentB: TestUser, ownerB: TestUser;
  let sA: string, sB: string;
  const channels: [SupabaseClient, RealtimeChannel][] = [];
  const received = new Map<string, Row[]>();

  const subscribe = async (name: string, user: TestUser) => {
    const { data } = await user.client.auth.getSession();
    await user.client.realtime.setAuth(data.session!.access_token);
    received.set(name, []);
    const channel = user.client
      .channel(`rt-test-${name}-${randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, (payload) => {
        received.get(name)!.push({ event: payload.eventType, ...(payload.new as Row) });
      });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${name}: canal não assinou em 15 s`)), 15_000);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timer);
          reject(new Error(`${name}: ${status}`));
        }
      });
    });
    channels.push([user.client, channel]);
  };

  const waitFor = async (check: () => boolean, ms: number) => {
    const end = Date.now() + ms;
    while (Date.now() < end && !check()) await new Promise((r) => setTimeout(r, 100));
    return check();
  };
  const bodies = (name: string) => received.get(name)!.map((r) => r.body);

  beforeAll(async () => {
    org = await fx.org("chat-rt");
    orgB = await fx.org("chat-rt-b");
    owner = await fx.user(org, "owner", "rt-owner");
    trainer = await fx.user(org, "trainer", "rt-resp");
    planTrainer = await fx.user(org, "trainer", "rt-plano");
    studentA = await fx.user(org, "student", "rt-a");
    studentB = await fx.user(org, "student", "rt-b");
    ownerB = await fx.user(orgB, "owner", "rt-owner-b");

    sA = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    sB = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    await fx.db.from("students").update({ trainer_id: trainer.id, user_id: studentA.id }).eq("id", sA);
    await fx.db.from("students").update({ trainer_id: trainer.id, user_id: studentB.id }).eq("id", sB);

    // Professor do plano de A, sem acesso ao aluno (não é o responsável): tudo-ou-nada no chat.
    const exercise = (await fx.db.from("exercises").select("id").is("organization_id", null).eq("name", "Abdominal supra").single()).data!.id;
    const planId = await rpc<string>(trainer.client, "save_training_plan", {
      p_plan: {
        student_id: sA,
        name: "Plano RT",
        trainer_id: planTrainer.id,
        starts_on: spDateDaysAgo(30),
        ends_on: spDateDaysAgo(-30),
        workouts: [{ label: "A", items: [{ exercise_id: exercise, sets: 1, quantity_unit: "reps", quantity_min: 10, quantity_max: 10 }] }],
      },
    });
    expect(await rpc(trainer.client, "activate_plan", { p_plan_id: planId })).toBe("active");
    expect(await rpc(planTrainer.client, "get_plan_header", { p_plan_id: planId })).toBeTruthy();

    for (const [name, user] of Object.entries({ studentA, trainer, owner, planTrainer, studentB, ownerB })) await subscribe(name, user);

    // Aquecimento: SUBSCRIBED chega um pouco antes de o servidor começar a entregar as mudanças da tabela. Espera a
    // primeira mensagem chegar aos 3 que acessam A — e confere que ela também não chegou a nenhum dos outros 3.
    const warm = `rt-aquecimento-${randomUUID()}`;
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      await rpc(studentA.client, "send_chat_message", { p_student_id: sA, p_body: `${warm}-${Date.now()}`, p_client_msg_id: randomUUID() });
      const ready = await waitFor(() => ["studentA", "trainer", "owner"].every((n) => bodies(n).some((b) => String(b).startsWith(warm))), 5_000);
      if (ready) break;
    }
    expect(["studentA", "trainer", "owner"].every((n) => bodies(n).some((b) => String(b).startsWith(warm)))).toBe(true);
    await new Promise((r) => setTimeout(r, 2_000));
    expect(received.get("planTrainer")).toEqual([]);
    expect(received.get("studentB")).toEqual([]);
    expect(received.get("ownerB")).toEqual([]);
    for (const list of received.values()) list.length = 0;
  }, 120_000);

  afterAll(async () => {
    for (const [client, channel] of channels) await client.removeChannel(channel);
    await fx.cleanup();
  });

  it("mensagem do aluno A chega a A, ao responsável e ao owner — e a ninguém mais", async () => {
    const canary = `rt-aluno-${randomUUID()}`;
    await rpc(studentA.client, "send_chat_message", { p_student_id: sA, p_body: canary, p_client_msg_id: randomUUID() });

    const allowed = ["studentA", "trainer", "owner"];
    expect(await waitFor(() => allowed.every((n) => bodies(n).includes(canary)), 15_000)).toBe(true);
    // Margem para uma entrega indevida chegar, se fosse acontecer.
    await new Promise((r) => setTimeout(r, 3_000));

    for (const n of allowed) {
      const got = received.get(n)!.filter((r) => r.body === canary);
      expect(got, n).toHaveLength(1);
      expect(got[0]).toMatchObject({ event: "INSERT", student_id: sA, sender_role: "student" });
    }
    expect(received.get("planTrainer")).toEqual([]);
    expect(received.get("studentB")).toEqual([]);
    expect(received.get("ownerB")).toEqual([]);
  }, 30_000);

  it("resposta do professor também só chega a quem acessa A; mensagem de B não chega a A", async () => {
    const reply = `rt-prof-${randomUUID()}`;
    const other = `rt-b-${randomUUID()}`;
    await rpc(trainer.client, "send_chat_message", { p_student_id: sA, p_body: reply, p_client_msg_id: randomUUID() });
    await rpc(studentB.client, "send_chat_message", { p_student_id: sB, p_body: other, p_client_msg_id: randomUUID() });

    expect(await waitFor(() => ["studentA", "trainer", "owner"].every((n) => bodies(n).includes(reply)), 15_000)).toBe(true);
    expect(await waitFor(() => ["studentB", "trainer", "owner"].every((n) => bodies(n).includes(other)), 15_000)).toBe(true);
    await new Promise((r) => setTimeout(r, 3_000));

    expect(bodies("studentA")).not.toContain(other);
    expect(bodies("studentB")).not.toContain(reply);
    expect(received.get("planTrainer")).toEqual([]);
    expect(received.get("ownerB")).toEqual([]);
  }, 40_000);
});
