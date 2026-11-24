import { describe, expect, it } from "vitest";
import { daysBetween, dueState, parseMyPlan } from "@/features/student-app/my-plan";
import { messages } from "@/messages/pt-BR";

const t = messages.aluno.profile.myPlan;

describe("Meu plano (Perfil do aluno)", () => {
  it("lê só os campos esperados; sem plano ou sem data de hoje → null", () => {
    expect(parseMyPlan(null)).toBeNull();
    expect(parseMyPlan({ name: "", today: "2026-11-24" })).toBeNull();
    expect(parseMyPlan({ name: "X", today: "ontem" })).toBeNull();
    const p = parseMyPlan({
      name: " Consultoria ", starts_on: "2026-11-01", ends_on: "2026-12-06", no_end: false, today: "2026-11-24",
      next_payment: { amount_cents: 18000, due_date: "2026-11-29" }, history: [1, 2, 3],
    });
    expect(p).toEqual({ name: "Consultoria", startsOn: "2026-11-01", endsOn: "2026-12-06", today: "2026-11-24", nextPayment: { amountCents: 18000, dueDate: "2026-11-29" } });
    expect(JSON.stringify(p)).not.toContain("history");
  });

  it("plano sem vencimento e pagamento inválido não aparecem como data/valor", () => {
    const p = parseMyPlan({ name: "X", ends_on: "2026-12-01", no_end: true, today: "2026-11-24", next_payment: { amount_cents: 0, due_date: "2026-11-30" } })!;
    expect(p.endsOn).toBeNull();
    expect(p.nextPayment).toBeNull();
  });

  it("prazo: vence em N dias / amanhã / hoje / vencido há N dias (datas civis, sem fuso)", () => {
    expect(daysBetween("2026-11-24", "2026-12-06")).toBe(12);
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3); // atravessa mês (e horário de verão não interfere)
    expect(dueState("2026-12-06", "2026-11-24")).toEqual({ kind: "future", days: 12 });
    expect(dueState("2026-11-24", "2026-11-24")).toEqual({ kind: "today" });
    expect(dueState("2026-11-21", "2026-11-24")).toEqual({ kind: "overdue", days: 3 });
    expect(t.dueIn(12)).toBe("vence em 12 dias");
    expect(t.dueIn(1)).toBe("vence amanhã");
    expect(t.dueToday).toBe("vence hoje");
    expect(t.overdue(3)).toBe("vencido há 3 dias");
  });

  it("Perfil sem os rótulos 'Estúdio' e 'Atendimento'", () => {
    const keys = Object.keys(messages.aluno.profile);
    expect(keys).not.toContain("organization");
    expect(keys).not.toContain("officeHours");
  });
});
