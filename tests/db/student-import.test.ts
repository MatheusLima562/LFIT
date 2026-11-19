import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IMPORT_DECLARATION_VERSION } from "@/features/import/declaration";
import { anon, dbTestsEnabled, Fixture, rpc, type TestOrg, type TestUser } from "./helpers";

/**
 * Importação (migration 20261119130000): lote com declaração versionada, `import_students` com as regras do cadastro por
 * linha (obrigatórios, e-mail único, limite do plano, matrícula, auditoria), uma importação por vez por organização,
 * pré-cadastro sem login nem convite, desfazer em 7 dias só para quem não teve atividade, isolamento entre organizações.
 */
interface ImportResult {
  created: number;
  results: { row: number; ok: boolean; error?: string; student_id?: string; enrollment_number?: number }[];
}

const person = (n: number, extra: Record<string, unknown> = {}) => ({
  row: n,
  first_name: "Importado",
  last_name: `Teste ${n}`,
  email: `import-${n}-${randomUUID().slice(0, 8)}@example.com`,
  ...extra,
});

describe.runIf(dbTestsEnabled)("importação de alunos (start_import_batch, import_students, undo_import_batch)", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, trainer: TestUser, studentUser: TestUser, ownerB: TestUser;

  const start = (u: TestUser, rows = 10) =>
    rpc<string>(u.client, "start_import_batch", { p_source_label: "Teste", p_declaration_version: IMPORT_DECLARATION_VERSION, p_rows_expected: rows });
  const send = (u: TestUser, batch: string, rows: unknown[]) => rpc<ImportResult>(u.client, "import_students", { p_batch_id: batch, p_rows: rows });
  const run = async (u: TestUser, rows: unknown[]) => send(u, await start(u, Math.max(1, rows.length)), rows);
  const activeCount = async () =>
    (await fx.db.from("students").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("status", "active").is("deleted_at", null)).count!;

  beforeAll(async () => {
    org = await fx.org("import");
    orgB = await fx.org("import-b");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer");
    studentUser = await fx.user(org, "student", "aluno");
    ownerB = await fx.user(orgB, "owner", "ob");
  });
  afterAll(() => fx.cleanup());

  it("declaração: versão desconhecida ou rótulo vazio são recusados; o lote guarda versão, data e contagens (sem dados)", async () => {
    await expect(rpc(owner.client, "start_import_batch", { p_source_label: "X", p_declaration_version: "inventada", p_rows_expected: 1 })).rejects.toThrow("INVALID_INPUT");
    await expect(rpc(owner.client, "start_import_batch", { p_source_label: "  ", p_declaration_version: IMPORT_DECLARATION_VERSION, p_rows_expected: 1 })).rejects.toThrow("INVALID_INPUT");
    const batch = await start(owner, 2);
    await send(owner, batch, [person(2), person(3, { email: "x" })]);
    const { data } = await fx.db.from("import_batches").select("*").eq("id", batch).single();
    expect(data).toMatchObject({ declaration_version: IMPORT_DECLARATION_VERSION, source_label: "Teste", created_by: owner.id, rows_sent: 2, created_count: 1, rejected_count: 1 });
    expect(data!.declared_at).toBeTruthy();
    expect(Object.keys(data!).sort()).toEqual(
      ["archived_count", "created_at", "created_by", "created_count", "declaration_version", "declared_at", "id", "kept_count", "organization_id", "rejected_count", "rows_expected", "rows_sent", "source_label", "undone_at", "undone_by"],
    );
  });

  it("importa linhas válidas com origem, lote, status, modalidade e matrícula; erro numa linha não desfaz as outras", async () => {
    const dup = person(4);
    const batch = await start(owner, 5);
    const res = await send(owner, batch, [
      person(2, { status: "inactive", modality: "presencial", whatsapp_e164: "+5541999010287", birth_date: "1990-12-31", notes: "Objetivo: força" }),
      person(3, { email: "sem-arroba" }),
      dup,
      { ...person(5), email: dup.email },
      person(6, { birth_date: "1990-13-45" }),
    ]);
    expect(res.created).toBe(2);
    expect(res.results.map((r) => [r.row, r.ok, r.error ?? null])).toEqual([
      [2, true, null],
      [3, false, "INVALID_INPUT"],
      [4, true, null],
      [5, false, "DUPLICATE_EMAIL"],
      [6, false, "INVALID_INPUT"],
    ]);
    const { data } = await fx.db.from("students").select("source, status, modality, trainer_id, enrollment_number, notes, import_batch_id, user_id").eq("id", res.results[0].student_id!).single();
    expect(data).toMatchObject({ source: "import", status: "inactive", modality: "presencial", trainer_id: null, notes: "Objetivo: força", import_batch_id: batch, user_id: null });
    expect(res.results[2].enrollment_number).toBe(data!.enrollment_number + 1);
  });

  it("pré-cadastro: nenhum convite ou link de acesso é criado na importação", async () => {
    const res = await run(owner, [person(2)]);
    const id = res.results[0].student_id!;
    const { data: s } = await fx.db.from("students").select("user_id").eq("id", id).single();
    expect(s!.user_id).toBeNull();
    const { data: links } = await fx.db.from("access_links").select("id").eq("student_id", id);
    expect(links).toHaveLength(0);
  });

  it("professor importa para si; trainer_id do arquivo é ignorado", async () => {
    const res = await run(trainer, [person(2, { trainer_id: owner.id })]);
    const { data } = await fx.db.from("students").select("trainer_id").eq("id", res.results[0].student_id!).single();
    expect(data!.trainer_id).toBe(trainer.id);
  });

  it("limite do plano: ativos além da vaga são recusados; inativos entram", async () => {
    await fx.db.from("organizations").update({ student_limit: await activeCount() }).eq("id", org.id);
    try {
      const res = await run(owner, [person(2), person(3, { status: "inactive" })]);
      expect(res.results.map((r) => r.error ?? "ok")).toEqual(["PLAN_LIMIT_REACHED", "ok"]);
    } finally {
      await fx.db.from("organizations").update({ student_limit: 50 }).eq("id", org.id);
    }
  });

  it("concorrência: dois lotes ao mesmo tempo não passam do limite do plano (uma importação por vez por organização)", async () => {
    const before = await activeCount();
    await fx.db.from("organizations").update({ student_limit: before + 1 }).eq("id", org.id);
    try {
      const [bo, bt] = await Promise.all([start(owner), start(trainer)]);
      const [a, b] = await Promise.all([send(owner, bo, [person(2)]), send(trainer, bt, [person(2)])]);
      const outcomes = [...a.results, ...b.results].map((r) => r.error ?? "ok").sort();
      expect(outcomes).toEqual(["PLAN_LIMIT_REACHED", "ok"]);
      expect(await activeCount()).toBe(before + 1);
    } finally {
      await fx.db.from("organizations").update({ student_limit: 50 }).eq("id", org.id);
    }
  });

  it("unicidade que não é a do e-mail vira INVALID_INPUT, não DUPLICATE_EMAIL", async () => {
    // Força a matrícula seguinte a colidir com uma existente (contador volta 1 número).
    const { data: c } = await fx.db.from("organization_counters").select("last_enrollment_number").eq("organization_id", org.id).single();
    await fx.db.from("organization_counters").update({ last_enrollment_number: c!.last_enrollment_number - 1 }).eq("organization_id", org.id);
    try {
      const res = await run(owner, [person(2)]);
      expect(res.results[0]).toMatchObject({ ok: false, error: "INVALID_INPUT" });
    } finally {
      await fx.db.from("organization_counters").update({ last_enrollment_number: c!.last_enrollment_number }).eq("organization_id", org.id);
    }
  });

  it("limite por célula: e-mail > 254 ou texto > 2000 recusados no banco", async () => {
    const res = await run(owner, [person(2, { email: `${"a".repeat(260)}@example.com` }), person(3, { notes: "x".repeat(2001) }), person(4, { last_name: "y".repeat(121) })]);
    expect(res.results.map((r) => r.error)).toEqual(["INVALID_INPUT", "INVALID_INPUT", "INVALID_INPUT"]);
  });

  it("lote: só o autor envia linhas; outra organização não usa nem vê; vazio, > 200 ou mal formado = INVALID_INPUT", async () => {
    const batch = await start(owner);
    await expect(send(trainer, batch, [person(2)])).rejects.toThrow("IMPORT_BATCH_NOT_FOUND");
    await expect(send(ownerB, batch, [person(2)])).rejects.toThrow("IMPORT_BATCH_NOT_FOUND");
    await expect(send(owner, randomUUID(), [person(2)])).rejects.toThrow("IMPORT_BATCH_NOT_FOUND");
    await expect(send(owner, batch, [])).rejects.toThrow("INVALID_INPUT");
    await expect(send(owner, batch, Array.from({ length: 201 }, (_, i) => person(i + 2)))).rejects.toThrow("INVALID_INPUT");
    await expect(rpc(owner.client, "import_students", { p_batch_id: batch, p_rows: { a: 1 } })).rejects.toThrow("INVALID_INPUT");
    // Lote vencido (24 h) não recebe mais linhas.
    await fx.db.from("import_batches").update({ created_at: new Date(Date.now() - 25 * 3_600_000).toISOString() }).eq("id", batch);
    await expect(send(owner, batch, [person(2)])).rejects.toThrow("IMPORT_BATCH_NOT_FOUND");
    // RLS: outra organização não vê os lotes; professor vê só os próprios; owner vê todos.
    const { data: b } = await ownerB.client.from("import_batches").select("id").eq("organization_id", org.id);
    expect(b ?? []).toHaveLength(0);
    const { data: tr } = await trainer.client.from("import_batches").select("created_by");
    expect((tr ?? []).every((x) => x.created_by === trainer.id)).toBe(true);
    const { data: ow } = await owner.client.from("import_batches").select("created_by");
    expect(new Set((ow ?? []).map((x) => x.created_by))).toEqual(new Set([owner.id, trainer.id]));
  });

  it("desfazer: arquiva só quem não teve atividade; autor ou owner; uma vez; até 7 dias", async () => {
    const batch = await start(trainer, 3);
    const res = await send(trainer, batch, [person(2), person(3), person(4)]);
    const [a, b, c] = res.results.map((r) => r.student_id!);
    // b teve atividade (cadastro editado depois: o gatilho grava updated_at); c recebeu mensagem no chat.
    await fx.db.from("students").update({ notes: "editado" }).eq("id", b);
    await fx.db.from("chat_messages").insert({ organization_id: org.id, student_id: c, sender_role: "student", body: "oi" });

    await expect(rpc(ownerB.client, "undo_import_batch", { p_batch_id: batch })).rejects.toThrow("IMPORT_BATCH_NOT_FOUND");
    await expect(rpc(studentUser.client, "undo_import_batch", { p_batch_id: batch })).rejects.toThrow("FORBIDDEN");
    expect(await rpc(owner.client, "undo_import_batch", { p_batch_id: batch })).toEqual({ archived: 1, kept: 2 });
    const { data } = await fx.db.from("students").select("id, deleted_at").in("id", [a, b, c]);
    const deleted = Object.fromEntries((data ?? []).map((s) => [s.id, s.deleted_at !== null]));
    expect(deleted).toEqual({ [a]: true, [b]: false, [c]: false });
    await expect(rpc(trainer.client, "undo_import_batch", { p_batch_id: batch })).rejects.toThrow("IMPORT_ALREADY_UNDONE");

    // Professor não desfaz lote de outra pessoa; prazo de 7 dias.
    const other = await start(owner, 1);
    await send(owner, other, [person(2)]);
    await expect(rpc(trainer.client, "undo_import_batch", { p_batch_id: other })).rejects.toThrow("IMPORT_BATCH_NOT_FOUND");
    await fx.db.from("import_batches").update({ created_at: new Date(Date.now() - 8 * 86_400_000).toISOString() }).eq("id", other);
    await expect(rpc(owner.client, "undo_import_batch", { p_batch_id: other })).rejects.toThrow("IMPORT_UNDO_EXPIRED");
  });

  it("resposta e auditoria não trazem dados da linha", async () => {
    const res = await run(owner, [person(2, { notes: "canário-importação" }), person(3, { email: "x" })]);
    expect(JSON.stringify(res)).not.toMatch(/canário|example\.com|Importado/);
    const { data } = await fx.db.from("audit_logs").select("diff").eq("organization_id", org.id).in("action", ["students.imported", "students.import_started", "students.import_undone"]);
    expect(data!.length).toBeGreaterThan(0);
    expect(JSON.stringify(data)).not.toMatch(/canário|example\.com|Importado/);
  });

  it("aluno e anônimo recusados; outra organização não enxerga os alunos importados", async () => {
    await expect(start(studentUser)).rejects.toThrow("FORBIDDEN");
    await expect(rpc(anon(), "start_import_batch", { p_source_label: "X", p_declaration_version: IMPORT_DECLARATION_VERSION, p_rows_expected: 1 })).rejects.toThrow();
    await expect(rpc(anon(), "import_students", { p_batch_id: randomUUID(), p_rows: [person(2)] })).rejects.toThrow();
    await expect(rpc(anon(), "undo_import_batch", { p_batch_id: randomUUID() })).rejects.toThrow();
    const { data } = await ownerB.client.from("students").select("id").eq("organization_id", org.id);
    expect(data ?? []).toHaveLength(0);
  });
});
