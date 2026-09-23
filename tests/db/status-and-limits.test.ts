import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbTestsEnabled, Fixture, rpc, spDateDaysAgo, studentData, type TestOrg, type TestUser } from "./helpers";

type Student = { id: string; enrollment_number: number };

describe.runIf(dbTestsEnabled)("status efetivo, limite do plano e matrícula", () => {
  const fx = new Fixture();
  let org: TestOrg;
  let owner: TestUser;

  beforeAll(async () => {
    org = await fx.org("status", 5);
    owner = await fx.user(org, "owner");
  });
  afterAll(() => fx.cleanup());

  const create = (extra = {}) => rpc<Student>(owner.client, "create_student", { p_data: studentData(extra) });
  const act = (fn: string, id: string) => rpc(owner.client, fn, { p_student_id: id });
  const statusOf = async (id: string) => {
    const { data, error } = await owner.client.from("students_with_status").select("effective_status").eq("id", id).single();
    if (error) throw error;
    return data.effective_status as string;
  };
  const setOverdue = async (studentId: string, daysAgo: number) => {
    await fx.db.from("payments").delete().eq("student_id", studentId);
    const { error } = await fx.db.from("payments").insert({
      organization_id: org.id,
      student_id: studentId,
      amount_cents: 15000,
      due_date: spDateDaysAgo(daysAgo),
    });
    if (error) throw error;
  };

  describe("effective_status", () => {
    let s: Student;
    beforeAll(async () => {
      s = await create();
    });

    it("novo aluno é active", async () => {
      expect(await statusOf(s.id)).toBe("active");
    });

    it("desativar → inactive; expirar → expired (expirado prevalece)", async () => {
      await act("deactivate_student", s.id);
      expect(await statusOf(s.id)).toBe("inactive");
      await act("expire_student", s.id);
      expect(await statusOf(s.id)).toBe("expired");
      await act("clear_student_expiration", s.id);
      await act("reactivate_student", s.id);
      expect(await statusOf(s.id)).toBe("active");
    });

    it("expiração no futuro mantém active", async () => {
      const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
      await rpc(owner.client, "update_student", { p_student_id: s.id, p_patch: { access_expires_at: future } });
      expect(await statusOf(s.id)).toBe("active");
      await rpc(owner.client, "update_student", { p_student_id: s.id, p_patch: { access_expires_at: null } });
    });

    it("bloqueio respeita a carência de 5 dias", async () => {
      await rpc(owner.client, "update_student", { p_student_id: s.id, p_patch: { block_if_overdue: true } });
      await setOverdue(s.id, 5);
      expect(await statusOf(s.id)).toBe("active");
      await setOverdue(s.id, 6);
      expect(await statusOf(s.id)).toBe("blocked");
    });

    it("sem a opção de bloqueio, inadimplente continua active", async () => {
      await rpc(owner.client, "update_student", { p_student_id: s.id, p_patch: { block_if_overdue: false } });
      expect(await statusOf(s.id)).toBe("active");
      await rpc(owner.client, "update_student", { p_student_id: s.id, p_patch: { block_if_overdue: true } });
    });

    it("pagamento quitado desbloqueia", async () => {
      await fx.db.from("payments").update({ status: "paid", paid_at: new Date().toISOString() }).eq("student_id", s.id);
      expect(await statusOf(s.id)).toBe("active");
      await setOverdue(s.id, 10);
      expect(await statusOf(s.id)).toBe("blocked");
    });

    it("inactive prevalece sobre blocked; aba Ativos inclui bloqueados", async () => {
      await act("deactivate_student", s.id);
      expect(await statusOf(s.id)).toBe("inactive");
      await act("reactivate_student", s.id);
      const [counts] = await rpc<{ active: number }[]>(owner.client, "student_tab_counts");
      expect(Number(counts.active)).toBe(1);
    });
  });

  describe("limite do plano (5 vagas; blocked ocupa vaga)", () => {
    const made: Student[] = [];

    it("bloqueia o cadastro além do limite", async () => {
      // 1 aluno bloqueado já existe da suíte anterior.
      for (let i = 0; i < 4; i++) made.push(await create());
      const [usage] = await rpc<{ used: number; remaining: number }[]>(owner.client, "organization_plan_usage");
      expect(Number(usage.used)).toBe(5);
      expect(Number(usage.remaining)).toBe(0);
      await expect(create()).rejects.toThrow("PLAN_LIMIT_REACHED");
    });

    it("desativar libera vaga; reativar com plano cheio é bloqueado", async () => {
      await act("deactivate_student", made[0].id);
      made.push(await create());
      await expect(act("reactivate_student", made[0].id)).rejects.toThrow("PLAN_LIMIT_REACHED");
    });

    it("expirar libera vaga; limpar expiração com plano cheio é bloqueado", async () => {
      await act("expire_student", made[1].id);
      await act("reactivate_student", made[0].id);
      await expect(act("clear_student_expiration", made[1].id)).rejects.toThrow("PLAN_LIMIT_REACHED");
    });
  });

  describe("matrícula", () => {
    it("20 cadastros concorrentes geram números únicos e sem buracos", async () => {
      await fx.db.from("organizations").update({ student_limit: 100 }).eq("id", org.id);
      const before = await fx.db.from("organization_counters").select("last_enrollment_number").eq("organization_id", org.id).single();
      const start = before.data!.last_enrollment_number as number;

      const created = await Promise.all(Array.from({ length: 20 }, () => create()));
      const numbers = created.map((s) => s.enrollment_number).sort((a, b) => a - b);

      expect(new Set(numbers).size).toBe(20);
      expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => start + i + 1));
    });

    it("e-mail duplicado na mesma org é recusado", async () => {
      const email = `dup-${Date.now()}@example.com`;
      await create({ email });
      await expect(create({ email: email.toUpperCase() })).rejects.toThrow(/duplicate|unique/);
    });
  });

  describe("exclusão e auditoria", () => {
    it("grupo especial exige consentimento e a auditoria não guarda o conteúdo sensível", async () => {
      const group = await fx.group(org, "Dor no Ombro");
      await expect(create({ group_ids: [group] })).rejects.toThrow("HEALTH_CONSENT_REQUIRED");

      const s = await create({ group_ids: [group], health_data_consent: true });
      await rpc(owner.client, "update_student", { p_student_id: s.id, p_patch: { notes: "Hérnia L4-L5", group_ids: [] } });

      const { data: logs } = await owner.client.from("audit_logs").select("action, diff").eq("entity_id", s.id);
      expect(logs!.some((l) => l.action === "student.health_data_changed")).toBe(true);
      expect(JSON.stringify(logs)).not.toContain("Hérnia");
    });

    it("exclusão exige confirmar o nome e libera o e-mail", async () => {
      const email = `del-${Date.now()}@example.com`;
      const s = await create({ email, first_name: "Maria", last_name: "Silva" });
      await expect(rpc(owner.client, "soft_delete_student", { p_student_id: s.id, p_confirm_name: "Maria" })).rejects.toThrow(
        "CONFIRMATION_MISMATCH",
      );
      await rpc(owner.client, "soft_delete_student", { p_student_id: s.id, p_confirm_name: " maria SILVA " });
      const { data } = await owner.client.from("students").select("id").eq("id", s.id);
      expect(data).toHaveLength(0);
      await expect(create({ email })).resolves.toBeTruthy();
    });
  });
});
