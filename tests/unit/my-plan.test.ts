import { describe, expect, it } from "vitest";
import { validateRow } from "@/features/import/validate";
import { daysBetween, dueState, parseMyPlan } from "@/features/student-app/my-plan";
import { studentFormSchema, emptyStudentForm } from "@/features/students/schemas";
import { messages } from "@/messages/pt-BR";

const tt = messages.aluno.profile.training;
const tb = messages.aluno.profile.billing;

describe("Perfil do aluno: 'Treino atual' e 'Plano'", () => {
  it("lê os dois blocos separados; nada de campos extras; sem nada → null", () => {
    expect(parseMyPlan(null)).toBeNull();
    expect(parseMyPlan({ today: "2026-11-24", training: null, billing: null, next_payment: null })).toBeNull();
    const p = parseMyPlan({
      today: "2026-11-24",
      training: { name: " Hipertrofia ABC ", valid_until: "2026-12-06", no_end: false },
      billing: { cycle: "monthly", amount_cents: 24990 },
      next_payment: { amount_cents: 24990, due_date: "2026-11-29" },
      history: [1, 2],
    });
    expect(p).toEqual({
      today: "2026-11-24",
      training: { name: "Hipertrofia ABC", validUntil: "2026-12-06" },
      billing: { cycle: "monthly", amountCents: 24990 },
      nextPayment: { amountCents: 24990, dueDate: "2026-11-29" },
    });
    expect(JSON.stringify(p)).not.toContain("history");
  });

  it("sem ciclo: só o próximo pagamento; ciclo inválido ignorado; treino sem término", () => {
    const p = parseMyPlan({ today: "2026-11-24", billing: { cycle: "weekly" }, next_payment: { amount_cents: 18000, due_date: "2026-11-30" } })!;
    expect(p.billing).toBeNull();
    expect(p.nextPayment).toEqual({ amountCents: 18000, dueDate: "2026-11-30" });
    expect(parseMyPlan({ today: "2026-11-24", training: { name: "X", valid_until: "2026-12-01", no_end: true } })!.training).toEqual({ name: "X", validUntil: null });
  });

  it("treino: 'válido até' (nunca 'vence'); pagamento: vence em N / hoje / vencido há N", () => {
    expect(tt.validUntil("06/12/2026")).toBe("Válido até 06/12/2026");
    expect(JSON.stringify(tt)).not.toMatch(/vence/i);
    expect(tb.cycle.monthly).toBe("Plano mensal");
    expect(tb.nextPaymentValue("R$ 249,90", "29/11")).toBe("R$ 249,90 em 29/11");
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
    expect(dueState("2026-12-06", "2026-11-24")).toEqual({ kind: "future", days: 12 });
    expect(dueState("2026-11-24", "2026-11-24")).toEqual({ kind: "today" });
    expect(dueState("2026-11-21", "2026-11-24")).toEqual({ kind: "overdue", days: 3 });
    expect(tb.dueIn(12)).toBe("vence em 12 dias");
    expect(tb.dueToday).toBe("vence hoje");
    expect(tb.overdue(3)).toBe("vencido há 3 dias");
  });

  it("Perfil sem os rótulos 'Estúdio' e 'Atendimento'", () => {
    const keys = Object.keys(messages.aluno.profile);
    expect(keys).not.toContain("organization");
    expect(keys).not.toContain("officeHours");
  });
});

describe("cadastro do aluno: ciclo e valor do plano", () => {
  const base = { ...emptyStudentForm, firstName: "Ana", lastName: "Souza", email: "ana@example.com" };
  it("ciclo da lista e valor em reais; vazio é aceito; valor inválido recusado", () => {
    expect(studentFormSchema.safeParse({ ...base, billingCycle: "quarterly", planAmount: "1.234,56" }).success).toBe(true);
    expect(studentFormSchema.safeParse(base).success).toBe(true);
    expect(studentFormSchema.safeParse({ ...base, billingCycle: "weekly" }).success).toBe(false);
    expect(studentFormSchema.safeParse({ ...base, planAmount: "abc" }).success).toBe(false);
  });
  it("importação: colunas opcionais; não reconhecido → aviso, a linha entra sem o dado", () => {
    const mapping = { name: 0, last_name: 1, email: 2, phone: null, birth_date: null, goal: null, notes: null, start_date: null, modality: null, status: null, billing_cycle: 3, plan_amount: 4 };
    const ok = validateRow(2, ["Ana", "Souza", "ana@x.com", "Trimestral", "R$ 599,90"], mapping, new Set(), "2026-11-24");
    expect(ok.payload).toMatchObject({ billing_cycle: "quarterly", plan_amount_cents: 59990 });
    const bad = validateRow(3, ["Bia", "Lima", "bia@x.com", "quinzenal", "caro"], mapping, new Set(), "2026-11-24");
    expect(bad.payload).toMatchObject({ billing_cycle: null, plan_amount_cents: null });
    expect(bad.warnings).toEqual(expect.arrayContaining(["billing_cycle_unknown", "plan_amount_invalid"]));
    const none = validateRow(4, ["Caio", "Reis", "caio@x.com", "", ""], mapping, new Set(), "2026-11-24");
    expect(none.payload).toMatchObject({ billing_cycle: null, plan_amount_cents: null });
    expect(none.warnings).toEqual([]);
  });
});
