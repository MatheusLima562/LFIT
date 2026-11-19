import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbTestsEnabled, Fixture, rpc, studentData, type TestOrg, type TestUser } from "./helpers";
import { CLI_TIMEOUT_MS, sqlLinked } from "./linked-sql";

/**
 * Recado unificado com o feed (1.6, migration 20261120160000): recado para todos = post fixado com "fixado até";
 * a RPC do recado recusa o "para todos"; o Hoje do aluno mostra o fixado mais recente que ele vê.
 */
interface Pinned { id: string; body: string }

describe.runIf(dbTestsEnabled)("recado para todos no feed", () => {
  const fx = new Fixture();
  let org: TestOrg;
  let owner: TestUser, trainer: TestUser, trainer2: TestUser, alunoT1: TestUser, alunoT2: TestUser;
  let s1: string;

  const save = (u: TestUser, data: Record<string, unknown>, id?: string) =>
    rpc<{ id: string; unpin_at: string | null }>(u.client, "save_feed_post", { p_data: data, ...(id ? { p_id: id } : {}) });
  const pinnedFor = (u: TestUser) => rpc<Pinned | null>(u.client, "get_my_pinned_post");
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

  beforeAll(async () => {
    org = await fx.org("ann");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer", "t1");
    trainer2 = await fx.user(org, "trainer", "t2");
    alunoT1 = await fx.user(org, "student", "a1");
    alunoT2 = await fx.user(org, "student", "a2");
    s1 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    const s2 = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    await fx.db.from("students").update({ trainer_id: trainer.id, user_id: alunoT1.id }).eq("id", s1);
    await fx.db.from("students").update({ trainer_id: trainer2.id, user_id: alunoT2.id }).eq("id", s2);
  });
  afterAll(() => fx.cleanup());

  it("recado para todos pela RPC antiga é recusado (use_feed); para um aluno continua", async () => {
    await expect(rpc(trainer.client, "set_trainer_announcement", { p_body: "para todos" })).rejects.toThrow("INVALID_INPUT");
    await expect(rpc(trainer.client, "set_trainer_announcement", { p_body: "só para você", p_student_id: s1 })).resolves.toBeTruthy();
  });

  it("post fixado até uma data aparece no Hoje dos alunos que o veem (escopo do autor)", async () => {
    expect(await pinnedFor(alunoT1)).toBeNull();
    const p = await save(trainer, { kind: "text", body: "Recado da semana", audience: "all", pinned: true, unpin_at: inDays(7) });
    expect(p.unpin_at).toBeTruthy();
    expect(await pinnedFor(alunoT1)).toMatchObject({ id: p.id, body: "Recado da semana" });
    expect(await pinnedFor(alunoT2)).toBeNull(); // post de professor da equipe: só os alunos dele
    // O mais recente vence.
    const newer = await save(owner, { kind: "text", body: "Recado do personal", audience: "all", pinned: true });
    expect((await pinnedFor(alunoT1))?.id).toBe(newer.id);
    expect((await pinnedFor(alunoT2))?.id).toBe(newer.id);
    await rpc(owner.client, "set_feed_post_pinned", { p_id: newer.id, p_pinned: false });
    expect((await pinnedFor(alunoT1))?.id).toBe(p.id);
  });

  it("validação do 'fixado até': depois da publicação, até 1 ano; ignorado sem fixar", async () => {
    await expect(save(owner, { kind: "text", body: "x", audience: "all", pinned: true, unpin_at: inDays(-1) })).rejects.toThrow("INVALID_INPUT");
    await expect(save(owner, { kind: "text", body: "x", audience: "all", pinned: true, unpin_at: inDays(400) })).rejects.toThrow("INVALID_INPUT");
    await expect(save(owner, { kind: "text", body: "x", audience: "all", pinned: true, published_at: inDays(5), unpin_at: inDays(3) })).rejects.toThrow("INVALID_INPUT");
    const notPinned = await save(owner, { kind: "text", body: "sem fixar", audience: "all", pinned: false, unpin_at: inDays(3) });
    expect(notPinned.unpin_at).toBeNull();
  });

  it("venceu: sai do topo na hora (leitura) e o job grava pinned = false; não é apagado", async () => {
    const p = await save(trainer, { kind: "text", body: "Vence logo", audience: "all", pinned: true, unpin_at: inDays(1) });
    expect((await pinnedFor(alunoT1))?.id).toBe(p.id);
    await fx.db.from("feed_posts").update({ unpin_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", p.id);
    expect((await pinnedFor(alunoT1))?.id).not.toBe(p.id);
    const feed = await rpc<{ posts: { id: string; pinned: boolean }[] }>(alunoT1.client, "get_my_feed");
    expect(feed.posts.find((x) => x.id === p.id)).toMatchObject({ pinned: false });
    const staff = await rpc<{ id: string; pinned: boolean }[]>(trainer.client, "list_feed_posts");
    expect(staff.find((x) => x.id === p.id)).toMatchObject({ pinned: false });
    sqlLinked("select private.unpin_expired_feed_posts();");
    const { data } = await fx.db.from("feed_posts").select("pinned, deleted_at").eq("id", p.id).single();
    expect(data).toEqual({ pinned: false, deleted_at: null });
  }, CLI_TIMEOUT_MS * 2);

  it("desafixar pelo botão limpa o 'fixado até'", async () => {
    const p = await save(owner, { kind: "text", body: "Limpa data", audience: "all", pinned: true, unpin_at: inDays(5) });
    await rpc(owner.client, "set_feed_post_pinned", { p_id: p.id, p_pinned: false });
    const { data } = await fx.db.from("feed_posts").select("pinned, unpin_at").eq("id", p.id).single();
    expect(data).toEqual({ pinned: false, unpin_at: null });
  });
});
