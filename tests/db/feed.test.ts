import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, studentData, type TestOrg, type TestUser } from "./helpers";

/**
 * Feed (Comunidade), fase 1 (migration 20261119160000): só staff publica; aluno lê o feed do PRÓPRIO personal e do
 * próprio público; agendado invisível antes da hora; apagado invisível; curtidas só como contagem (nunca quem curtiu);
 * isolamento entre organizações; texto sem HTML; vídeo só por link https permitido; imagem no bucket privado com RLS.
 */
interface Post { id: string; like_count: number; liked?: boolean; pinned: boolean; body: string; published_at: string }
interface MyFeed { last_seen_at: string | null; posts: Post[] }

describe.runIf(dbTestsEnabled)("feed (save_feed_post, get_my_feed, toggle_feed_like, feed-media)", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, trainer: TestUser, trainer2: TestUser, ownerB: TestUser;
  let alunoT1: TestUser, alunoT2: TestUser, alunoB: TestUser;
  let s1: string, s2: string, sB: string, classId: string, classB: string;
  const uploaded: string[] = [];

  const save = (u: TestUser, data: Record<string, unknown>, id?: string) =>
    rpc<{ id: string; published_at: string }>(u.client, "save_feed_post", { p_data: data, ...(id ? { p_id: id } : {}) });
  const feed = (u: TestUser) => rpc<MyFeed>(u.client, "get_my_feed");
  const ids = async (u: TestUser) => (await feed(u)).posts.map((p) => p.id);
  const staffList = (u: TestUser) => rpc<(Post & { can_edit: boolean })[]>(u.client, "list_feed_posts");
  const text = (body: string, extra: Record<string, unknown> = {}) => ({ kind: "text", body, audience: "all", ...extra });

  const linkStudent = async (o: TestOrg, client: TestUser, studentUser: TestUser, trainerId: string | null, modality = "consultoria") => {
    const id = (await rpc<{ id: string }>(client.client, "create_student", { p_data: studentData() })).id;
    const { error } = await fx.db.from("students").update({ trainer_id: trainerId, user_id: studentUser.id, modality }).eq("id", id);
    if (error) throw error;
    return id;
  };
  const upload = async (u: TestUser, orgId: string) => {
    const path = `${orgId}/${randomUUID()}.webp`;
    const { error } = await u.client.storage.from("feed-media").upload(path, new Blob([new Uint8Array([82, 73, 70, 70])], { type: "image/webp" }), { contentType: "image/webp" });
    if (!error) uploaded.push(path);
    return { path, error };
  };
  const canSign = async (u: TestUser, path: string) => {
    const { data, error } = await u.client.storage.from("feed-media").createSignedUrl(path, 60);
    return !error && !!data?.signedUrl;
  };

  beforeAll(async () => {
    org = await fx.org("feed");
    orgB = await fx.org("feed-b");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer", "t1");
    trainer2 = await fx.user(org, "trainer", "t2");
    alunoT1 = await fx.user(org, "student", "a1");
    alunoT2 = await fx.user(org, "student", "a2");
    ownerB = await fx.user(orgB, "owner", "ob");
    alunoB = await fx.user(orgB, "student", "ab");
    s1 = await linkStudent(org, owner, alunoT1, trainer.id, "presencial");
    s2 = await linkStudent(org, owner, alunoT2, trainer2.id, "consultoria");
    sB = await linkStudent(orgB, ownerB, alunoB, null);
    const c = await fx.db.from("classes").insert({ organization_id: org.id, name: "Turma das 7h" }).select("id").single();
    classId = c.data!.id;
    await fx.db.from("class_students").insert({ class_id: classId, student_id: s1, organization_id: org.id });
    const cb = await fx.db.from("classes").insert({ organization_id: orgB.id, name: "Turma B" }).select("id").single();
    classB = cb.data!.id;
    void sB;
  });
  afterAll(async () => {
    if (uploaded.length) await fx.db.storage.from("feed-media").remove(uploaded);
    await fx.cleanup();
  });

  it("post do personal (owner) para todos: os dois alunos veem; aluno de outra organização não", async () => {
    const p = await save(owner, text("Dica geral"));
    expect(await ids(alunoT1)).toContain(p.id);
    expect(await ids(alunoT2)).toContain(p.id);
    expect(await ids(alunoB)).not.toContain(p.id);
    expect((await staffList(ownerB)).map((x) => x.id)).not.toContain(p.id);
  });

  it("post de professor da equipe: só os alunos dele veem", async () => {
    const p = await save(trainer, text("Só para os meus"));
    expect(await ids(alunoT1)).toContain(p.id);
    expect(await ids(alunoT2)).not.toContain(p.id);
  });

  it("público por modalidade e por turma", async () => {
    const m = await save(owner, text("Presenciais", { audience: "modality", audience_modality: "presencial" }));
    const c = await save(owner, text("Turma das 7h", { audience: "class", audience_class_id: classId }));
    expect(await ids(alunoT1)).toEqual(expect.arrayContaining([m.id, c.id]));
    const t2 = await ids(alunoT2);
    expect(t2).not.toContain(m.id);
    expect(t2).not.toContain(c.id);
    // Turma de outra organização é recusada.
    await expect(save(owner, text("x", { audience: "class", audience_class_id: classB }))).rejects.toThrow("INVALID_INPUT");
  });

  it("agendado: invisível ao aluno antes da hora, visível ao staff, fora das novidades", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const p = await save(owner, text("Amanhã", { published_at: future }));
    expect(await ids(alunoT1)).not.toContain(p.id);
    const list = await staffList(owner);
    expect(list.find((x) => x.id === p.id)?.published_at).toBeTruthy();
    // Publicar agora (edição com data atual) → aparece.
    await save(owner, text("Amanhã", { published_at: new Date().toISOString() }), p.id);
    expect(await ids(alunoT1)).toContain(p.id);
    // Mais de 1 ano à frente é recusado.
    await expect(save(owner, text("longe", { published_at: new Date(Date.now() + 400 * 86_400_000).toISOString() }))).rejects.toThrow("INVALID_INPUT");
  });

  it("criar com data no passado publica agora (não dá para antedatar)", async () => {
    const p = await save(owner, text("Antiga?", { published_at: "2020-01-01T00:00:00Z" }));
    expect(new Date(p.published_at).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("curtidas: contagem e o próprio estado; nunca quem curtiu; idempotente", async () => {
    const p = await save(owner, text("Curta aqui"));
    expect(await rpc(alunoT1.client, "toggle_feed_like", { p_post_id: p.id, p_like: true })).toEqual({ like_count: 1, liked: true });
    expect(await rpc(alunoT1.client, "toggle_feed_like", { p_post_id: p.id, p_like: true })).toEqual({ like_count: 1, liked: true });
    const seen2 = (await feed(alunoT2)).posts.find((x) => x.id === p.id)!;
    expect(seen2).toMatchObject({ like_count: 1, liked: false });
    const raw = JSON.stringify(await feed(alunoT2));
    expect(raw).not.toContain(s1);
    expect(raw).not.toContain(alunoT1.id);
    expect(raw).not.toMatch(/student_id|first_name|last_name|likers/);
    expect((await staffList(owner)).find((x) => x.id === p.id)?.like_count).toBe(1);
    expect(JSON.stringify(await staffList(owner))).not.toContain(s1);
    // Tabela de curtidas fora do alcance direto (aluno e staff).
    const direct = await alunoT2.client.from("feed_likes").select("*");
    expect(direct.data ?? []).toHaveLength(0);
    const directStaff = await owner.client.from("feed_likes").select("*");
    expect(directStaff.data ?? []).toHaveLength(0);
    expect(await rpc(alunoT1.client, "toggle_feed_like", { p_post_id: p.id, p_like: false })).toEqual({ like_count: 0, liked: false });
  });

  it("aluno não curte post que não vê (outro professor, outra organização, agendado)", async () => {
    const other = await save(trainer, text("Só T1"));
    await expect(rpc(alunoT2.client, "toggle_feed_like", { p_post_id: other.id, p_like: true })).rejects.toThrow("FEED_POST_NOT_FOUND");
    await expect(rpc(alunoB.client, "toggle_feed_like", { p_post_id: other.id, p_like: true })).rejects.toThrow("FEED_POST_NOT_FOUND");
    const later = await save(owner, text("Depois", { published_at: new Date(Date.now() + 3_600_000).toISOString() }));
    await expect(rpc(alunoT1.client, "toggle_feed_like", { p_post_id: later.id, p_like: true })).rejects.toThrow("FEED_POST_NOT_FOUND");
  });

  it("apagar (soft delete): some para o aluno e da lista; curtir recusado; só autor ou owner", async () => {
    const p = await save(trainer, text("Vou apagar"));
    await expect(rpc(trainer2.client, "delete_feed_post", { p_id: p.id })).rejects.toThrow("FEED_POST_NOT_FOUND");
    await expect(rpc(ownerB.client, "delete_feed_post", { p_id: p.id })).rejects.toThrow("FEED_POST_NOT_FOUND");
    await rpc(trainer.client, "delete_feed_post", { p_id: p.id });
    expect(await ids(alunoT1)).not.toContain(p.id);
    expect((await staffList(owner)).map((x) => x.id)).not.toContain(p.id);
    await expect(rpc(alunoT1.client, "toggle_feed_like", { p_post_id: p.id, p_like: true })).rejects.toThrow("FEED_POST_NOT_FOUND");
    const { data } = await fx.db.from("feed_posts").select("deleted_at").eq("id", p.id).single();
    expect(data!.deleted_at).toBeTruthy();
  });

  it("editar e fixar: autor ou owner; outro professor e outra organização não", async () => {
    const p = await save(trainer, text("Original"));
    await expect(save(trainer2, text("Invadido"), p.id)).rejects.toThrow("FEED_POST_NOT_FOUND");
    await expect(save(ownerB, text("Invadido"), p.id)).rejects.toThrow("FEED_POST_NOT_FOUND");
    await expect(rpc(trainer2.client, "set_feed_post_pinned", { p_id: p.id, p_pinned: true })).rejects.toThrow("FEED_POST_NOT_FOUND");
    await save(owner, text("Editado pelo personal"), p.id);
    await rpc(trainer.client, "set_feed_post_pinned", { p_id: p.id, p_pinned: true });
    const mine = (await feed(alunoT1)).posts;
    expect(mine[0]).toMatchObject({ id: p.id, pinned: true, body: "Editado pelo personal" });
    expect((await staffList(trainer2)).find((x) => x.id === p.id)?.can_edit).toBe(false);
  });

  it("validação: HTML, tamanho, tipo e link de vídeo (só https de YouTube/Vimeo/Instagram)", async () => {
    await expect(save(owner, text("<script>alert(1)</script>"))).rejects.toThrow("INVALID_INPUT");
    await expect(save(owner, text("<a href=x>oi</a>"))).rejects.toThrow("INVALID_INPUT");
    await expect(save(owner, text("x".repeat(2001)))).rejects.toThrow("INVALID_INPUT");
    await expect(save(owner, text("   "))).rejects.toThrow("INVALID_INPUT");
    await expect(save(owner, { kind: "nope", body: "x" })).rejects.toThrow("INVALID_INPUT");
    for (const url of [
      "javascript:alert(1)",
      "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://evil.com/youtube.com/x",
      "https://youtube.com.evil.com/x",
      "https://www.youtube.com/watch?v=\"><script>",
      "data:text/html,oi",
    ]) {
      await expect(save(owner, { kind: "video", video_url: url, audience: "all" }), url).rejects.toThrow("INVALID_INPUT");
    }
    const ok = await save(owner, { kind: "video", video_url: "https://www.instagram.com/reel/abc123/", body: "2 < 3", audience: "all" });
    expect(ok.id).toBeTruthy();
    // Gravação direta na tabela: sem grant (staff e aluno).
    const ins = await owner.client.from("feed_posts").insert({ organization_id: org.id, author_id: owner.id, kind: "text", body: "direto" });
    expect(ins.error).not.toBeNull();
    const upd = await owner.client.from("feed_posts").update({ body: "direto" }).eq("id", ok.id).select("id");
    expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
  });

  it("aluno e anônimo não publicam; aluno não lê a tabela; anônimo não lê o feed", async () => {
    await expect(save(alunoT1, text("aluno publicando"))).rejects.toThrow();
    await expect(rpc(anon(), "save_feed_post", { p_data: text("x") })).rejects.toThrow();
    await expect(rpc(anon(), "get_my_feed")).rejects.toThrow();
    await expect(rpc(anon(), "toggle_feed_like", { p_post_id: randomUUID(), p_like: true })).rejects.toThrow();
    await expect(rpc(owner.client, "get_my_feed")).rejects.toThrow("STUDENT_NOT_FOUND");
    const { data } = await alunoT1.client.from("feed_posts").select("id");
    expect(data ?? []).toHaveLength(0);
    // Staff de outra organização não lê os posts desta pela tabela.
    const { data: other } = await ownerB.client.from("feed_posts").select("id").eq("organization_id", org.id);
    expect(other ?? []).toHaveLength(0);
  });

  it("novidades: conta posts depois da última visita; zera ao marcar como visto", async () => {
    await rpc(alunoT1.client, "mark_feed_seen");
    expect(await rpc<number>(alunoT1.client, "get_my_feed_new_count")).toBe(0);
    await save(owner, text("Novidade"));
    expect(await rpc<number>(alunoT1.client, "get_my_feed_new_count")).toBe(1);
    expect((await feed(alunoT1)).last_seen_at).toBeTruthy();
    await rpc(alunoT1.client, "mark_feed_seen");
    expect(await rpc<number>(alunoT1.client, "get_my_feed_new_count")).toBe(0);
  });

  it("imagem: bucket privado; staff envia na pasta da org; aluno só lê imagem de post que vê; apagado deixa de abrir", async () => {
    // Aluno não envia; staff não envia na pasta de outra organização nem fora do padrão de nome.
    expect((await upload(alunoT1, org.id)).error).not.toBeNull();
    expect((await upload(owner, orgB.id)).error).not.toBeNull();
    const bad = await owner.client.storage.from("feed-media").upload(`${org.id}/x/foto.webp`, new Blob([new Uint8Array([1])], { type: "image/webp" }), { contentType: "image/webp" });
    expect(bad.error).not.toBeNull();

    const { path, error } = await upload(owner, org.id);
    expect(error).toBeNull();
    // Imagem que não foi enviada ou de outra organização é recusada no post.
    await expect(save(owner, { kind: "image", image_path: `${org.id}/${randomUUID()}.webp`, audience: "all" })).rejects.toThrow("INVALID_INPUT");
    const p = await save(owner, { kind: "image", image_path: path, audience: "modality", audience_modality: "presencial" });

    expect(await canSign(owner, path)).toBe(true);
    expect(await canSign(trainer2, path)).toBe(true); // staff da org
    expect(await canSign(alunoT1, path)).toBe(true); // presencial: vê o post
    expect(await canSign(alunoT2, path)).toBe(false); // consultoria: não vê
    expect(await canSign(alunoB, path)).toBe(false);
    expect(await canSign(ownerB, path)).toBe(false);
    const { data: pub } = fx.db.storage.from("feed-media").getPublicUrl(path);
    expect((await fetch(pub.publicUrl)).ok).toBe(false); // bucket privado

    await rpc(owner.client, "delete_feed_post", { p_id: p.id });
    expect(await canSign(alunoT1, path)).toBe(false);
  });

  it("aluno com acesso suspenso não lê o feed", async () => {
    await fx.db.from("students").update({ status: "inactive" }).eq("id", s2);
    await expect(feed(alunoT2)).rejects.toThrow("ACCESS_SUSPENDED");
    await fx.db.from("students").update({ status: "active" }).eq("id", s2);
  });

  it("conteúdo do post nunca vai para a auditoria", async () => {
    await save(owner, text("canário-feed-auditoria"));
    const { data } = await fx.db.from("audit_logs").select("diff, action").eq("organization_id", org.id);
    expect(JSON.stringify(data ?? [])).not.toContain("canário-feed-auditoria");
  });
});
