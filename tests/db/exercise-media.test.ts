import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, studentData, type TestOrg, type TestUser } from "./helpers";

const BUCKET = "exercise-media";
const bytes = (n: number) => new Uint8Array(n).fill(7);

describe.runIf(dbTestsEnabled)("Vídeo próprio do exercício: bucket, políticas, cota", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, trainer: TestUser, trainer2: TestUser, student: TestUser, ownerB: TestUser;
  let ex: string, ex2: string, exB: string, studentId: string;
  const paths: string[] = [];

  const upload = async (user: TestUser, path: string, size = 2000, contentType = "video/mp4") => {
    const r = await user.client.storage.from(BUCKET).upload(path, bytes(size), { contentType });
    if (!r.error) paths.push(path);
    return r;
  };
  const vid = (orgId: string, exId: string, ext = "mp4") => `${orgId}/${exId}/${randomUUID()}.${ext}`;
  const canRead = async (user: TestUser | null, path: string) => {
    const client = user ? user.client : anon();
    const { data } = await client.storage.from(BUCKET).download(path);
    return Boolean(data && data.size > 0);
  };

  beforeAll(async () => {
    org = await fx.org("media");
    orgB = await fx.org("media-b");
    await fx.db.from("organizations").update({ plan: "pro" }).eq("id", org.id);
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer", "t1");
    trainer2 = await fx.user(org, "trainer", "t2");
    student = await fx.user(org, "student");
    ownerB = await fx.user(orgB, "owner");
    ex = await rpc<string>(trainer.client, "save_exercise", { p_id: null, p_data: { name: "Com vídeo", muscle_groups: ["abdomen"] }, p_rules: [] });
    ex2 = await rpc<string>(trainer2.client, "save_exercise", { p_id: null, p_data: { name: "Do t2", muscle_groups: ["abdomen"] }, p_rules: [] });
    exB = await rpc<string>(ownerB.client, "save_exercise", { p_id: null, p_data: { name: "Da org B", muscle_groups: ["abdomen"] }, p_rules: [] });
    studentId = (await rpc<{ id: string }>(owner.client, "create_student", { p_data: studentData() })).id;
    await fx.db.from("students").update({ user_id: student.id }).eq("id", studentId);
  });
  afterAll(async () => {
    if (paths.length) await fx.db.storage.from(BUCKET).remove(paths);
    await fx.cleanup();
  });

  it("upload: só na pasta de exercício próprio editável; tipo e tamanho validados pelo bucket", async () => {
    expect((await upload(trainer, vid(org.id, ex))).error).toBeNull();
    expect((await upload(trainer, vid(org.id, ex, "webm"), 2000, "video/webm")).error).toBeNull();
    expect((await upload(trainer, vid(org.id, ex2))).error).not.toBeNull(); // exercício de outro trainer
    expect((await upload(trainer, vid(orgB.id, exB))).error).not.toBeNull(); // outra organização
    expect((await upload(trainer, `global/${ex}/${randomUUID()}.mp4`)).error).not.toBeNull();
    expect((await upload(trainer, vid(org.id, ex, "txt"), 100, "text/plain")).error).not.toBeNull();
    expect((await upload(trainer, vid(org.id, ex, "mp4"), 100, "application/octet-stream")).error).not.toBeNull();
    expect((await upload(trainer, `${org.id}/${ex}/video.mp4`)).error).not.toBeNull(); // nome fora do padrão
    expect((await upload(student, vid(org.id, ex))).error).not.toBeNull();
    expect((await anon().storage.from(BUCKET).upload(vid(org.id, ex), bytes(10), { contentType: "video/mp4" })).error).not.toBeNull();
  });

  it("recusa arquivo acima de 15 MB", async () => {
    const r = await upload(trainer, vid(org.id, ex), 15 * 1024 * 1024 + 1);
    expect(r.error).not.toBeNull();
  }, 60_000);

  it("gatilho: media_bytes vem do Storage; caminhos inválidos recusados; cliente não grava media_bytes", async () => {
    const video = vid(org.id, ex);
    const poster = vid(org.id, ex, "jpg");
    await upload(trainer, video, 3000);
    await upload(trainer, poster, 500, "image/jpeg");
    const ok = await trainer.client.from("exercises").update({ video_path: video, poster_path: poster }).eq("id", ex).select("media_bytes").single();
    expect(ok.error).toBeNull();
    expect(ok.data!.media_bytes).toBe(3500);

    const missing = await trainer.client.from("exercises").update({ video_path: vid(org.id, ex) }).eq("id", ex);
    expect(missing.error?.message).toBe("INVALID_MEDIA");
    const otherFolder = await trainer.client.from("exercises").update({ video_path: video }).eq("id", ex2);
    expect(otherFolder.error ?? "sem linhas").toBeTruthy();
    const forged = await trainer.client.from("exercises").update({ media_bytes: 0 }).eq("id", ex);
    expect(forged.error).not.toBeNull();
  });

  it("leitura: org, outra org, anônimo e aluno (só com o exercício no plano ativo)", async () => {
    const { data } = await fx.db.from("exercises").select("video_path, poster_path").eq("id", ex).single();
    const video = data!.video_path!;
    const who = { owner: await canRead(owner, video), trainer2: await canRead(trainer2, video), ownerB: await canRead(ownerB, video), anon: await canRead(null, video), student: await canRead(student, video) };
    expect(who).toEqual({ owner: true, trainer2: true, ownerB: false, anon: false, student: false });
    expect((await ownerB.client.storage.from(BUCKET).createSignedUrl(video, 60)).error).not.toBeNull();
    expect((await ownerB.client.storage.from(BUCKET).list(org.id)).data ?? []).toHaveLength(0);

    const planId = await rpc<string>(owner.client, "save_training_plan", {
      p_plan: { student_id: studentId, name: "Plano", starts_on: "2026-10-01", ends_on: "2026-12-01", workouts: [{ label: "A", items: [{ exercise_id: ex, sets: 3, reps: "10" }] }] },
    });
    expect(await canRead(student, video), "rascunho").toBe(false); // rascunho não conta
    await rpc(owner.client, "activate_plan", { p_plan_id: planId });
    expect(await canRead(student, video)).toBe(true);
    expect(await canRead(student, data!.poster_path!)).toBe(true);
    await rpc(owner.client, "archive_plan", { p_plan_id: planId });
    // A política é avaliada no banco a cada assinatura: nega na hora.
    expect((await student.client.storage.from(BUCKET).createSignedUrl(video, 60)).error, "assinar após arquivar").not.toBeNull();
    // Obs.: um download direto já feito pelo aluno pode continuar servido pelo cache do Storage por
    // um tempo (medido > 90 s), assim como uma URL assinada já emitida vale até expirar. Ver CLAUDE.md.
  });

  it("remover/excluir arquivo: só quem edita o exercício", async () => {
    const extra = vid(org.id, ex, "webm");
    await upload(trainer, extra, 100, "video/webm");
    const { data: byOther } = await trainer2.client.storage.from(BUCKET).remove([extra]);
    expect(byOther ?? []).toHaveLength(0);
    const { data: byOwner } = await owner.client.storage.from(BUCKET).remove([extra]);
    expect(byOwner).toHaveLength(1);
  });

  it("cota: uso x limite; excedente recusado; remover sempre permitido; plano free = só link", async () => {
    const [u] = await rpc<{ used_bytes: number; quota_bytes: number }[]>(trainer.client, "organization_video_usage");
    expect(Number(u.used_bytes)).toBe(3500);
    expect(Number(u.quota_bytes)).toBe(500 * 1024 * 1024);

    await fx.db.from("organizations").update({ video_quota_bytes: 4000 }).eq("id", org.id);
    const other = await rpc<string>(owner.client, "save_exercise", { p_id: null, p_data: { name: "Outro com vídeo", muscle_groups: ["abdomen"] }, p_rules: [] });
    const big = vid(org.id, other);
    await upload(owner, big, 1000);
    const over = await owner.client.from("exercises").update({ video_path: big }).eq("id", other);
    expect(over.error?.message).toBe("VIDEO_QUOTA_EXCEEDED");
    const removed = await trainer.client.from("exercises").update({ video_path: null }).eq("id", ex).select("media_bytes, poster_path").single();
    expect(removed.data).toEqual({ media_bytes: 0, poster_path: null });
    expect((await owner.client.from("exercises").update({ video_path: big }).eq("id", other)).error).toBeNull();
    await fx.db.from("organizations").update({ video_quota_bytes: null }).eq("id", org.id);

    const pathB = `${orgB.id}/${exB}/${randomUUID()}.mp4`;
    const up = await ownerB.client.storage.from(BUCKET).upload(pathB, bytes(100), { contentType: "video/mp4" });
    if (!up.error) paths.push(pathB);
    const free = await ownerB.client.from("exercises").update({ video_path: pathB }).eq("id", exB);
    expect(free.error?.message).toBe("VIDEO_QUOTA_EXCEEDED");
  });

  it("exclusão definitiva do exercício: só owner", async () => {
    const tmp = await rpc<string>(trainer.client, "save_exercise", { p_id: null, p_data: { name: "Temporário", muscle_groups: ["abdomen"] }, p_rules: [] });
    expect((await trainer.client.from("exercises").delete().eq("id", tmp).select("id")).data ?? []).toHaveLength(0);
    expect((await owner.client.from("exercises").delete().eq("id", tmp).select("id")).data).toHaveLength(1);
    // Em uso num plano: a FK impede.
    const used = await owner.client.from("exercises").delete().eq("id", ex);
    expect(used.error?.code).toBe("23503");
  });
});
