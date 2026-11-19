import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, dbTestsEnabled, Fixture, rpc, type TestOrg, type TestUser } from "./helpers";

/**
 * Importação (migration 20261119130000): `import_students` aplica as regras do cadastro por linha (obrigatórios, e-mail
 * único, limite do plano, matrícula, auditoria), erro numa linha não desfaz as outras, a resposta só traz linha + código
 * e o professor importa para si.
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

describe.runIf(dbTestsEnabled)("importação de alunos (import_students)", () => {
  const fx = new Fixture();
  let org: TestOrg, orgB: TestOrg;
  let owner: TestUser, trainer: TestUser, studentUser: TestUser, ownerB: TestUser;

  const run = (u: TestUser, rows: unknown[]) => rpc<ImportResult>(u.client, "import_students", { p_batch_id: randomUUID(), p_rows: rows });

  beforeAll(async () => {
    org = await fx.org("import");
    orgB = await fx.org("import-b");
    owner = await fx.user(org, "owner");
    trainer = await fx.user(org, "trainer");
    studentUser = await fx.user(org, "student", "aluno");
    ownerB = await fx.user(orgB, "owner", "ob");
  });
  afterAll(() => fx.cleanup());

  it("importa linhas válidas com origem import, status, modalidade e matrícula; erro numa linha não desfaz as outras", async () => {
    const dup = person(4);
    const res = await run(owner, [
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
    const { data } = await fx.db.from("students").select("source, status, modality, trainer_id, enrollment_number, notes").eq("id", res.results[0].student_id!).single();
    expect(data).toMatchObject({ source: "import", status: "inactive", modality: "presencial", trainer_id: null, notes: "Objetivo: força" });
    expect(res.results[2].enrollment_number).toBe(data!.enrollment_number + 1);
  });

  it("professor importa para si; trainer_id do arquivo é ignorado", async () => {
    const res = await run(trainer, [person(2, { trainer_id: owner.id })]);
    const { data } = await fx.db.from("students").select("trainer_id").eq("id", res.results[0].student_id!).single();
    expect(data!.trainer_id).toBe(trainer.id);
  });

  it("limite do plano: ativos além da vaga são recusados; inativos entram", async () => {
    const { count } = await fx.db.from("students").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("status", "active").is("deleted_at", null);
    await fx.db.from("organizations").update({ student_limit: count! }).eq("id", org.id);
    const res = await run(owner, [person(2), person(3, { status: "inactive" })]);
    expect(res.results.map((r) => r.error ?? "ok")).toEqual(["PLAN_LIMIT_REACHED", "ok"]);
    await fx.db.from("organizations").update({ student_limit: 50 }).eq("id", org.id);
  });

  it("resposta e auditoria não trazem dados da linha", async () => {
    const res = await run(owner, [person(2, { notes: "canário-importação" }), person(3, { email: "x" })]);
    expect(JSON.stringify(res)).not.toMatch(/canário|example\.com|Importado/);
    const { data } = await fx.db.from("audit_logs").select("diff").eq("organization_id", org.id).eq("action", "students.imported");
    expect(data!.length).toBeGreaterThan(0);
    expect(JSON.stringify(data)).not.toMatch(/canário|example\.com|Importado/);
  });

  it("lote vazio, acima de 200 ou mal formado: INVALID_INPUT", async () => {
    await expect(run(owner, [])).rejects.toThrow("INVALID_INPUT");
    await expect(run(owner, Array.from({ length: 201 }, (_, i) => person(i + 2)))).rejects.toThrow("INVALID_INPUT");
    await expect(rpc(owner.client, "import_students", { p_batch_id: randomUUID(), p_rows: { a: 1 } })).rejects.toThrow("INVALID_INPUT");
  });

  it("aluno e anônimo recusados; outra organização não enxerga o que foi importado", async () => {
    await expect(run(studentUser, [person(2)])).rejects.toThrow("FORBIDDEN");
    await expect(rpc(anon(), "import_students", { p_batch_id: randomUUID(), p_rows: [person(2)] })).rejects.toThrow();
    const { data } = await ownerB.client.from("students").select("id").eq("organization_id", org.id);
    expect(data ?? []).toHaveLength(0);
  });
});
