import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAccountSchema, parseAccounts, parseMoneyToCents, paymentSchema, whatsappUrl } from "@/features/platform/platform";
import { closedAllows, daysLeft, isReadOnly, parseSubscription } from "@/features/subscription/subscription";
import { messages } from "@/messages/pt-BR";

const SQL = readFileSync(join(process.cwd(), "supabase/migrations/20261120120000_platform_billing.sql"), "utf8");

describe("plataforma (lógica pura)", () => {
  it("lê só os campos de conta; qualquer outro campo é descartado", () => {
    const [a] = parseAccounts([{ id: "o1", name: "Studio", owner_name: "Paula", owner_email: "p@x.com", plan: "pro", student_limit: 50, seats_used: 12, subscription_status: "past_due", access_state: "grace", student_names: ["Ana"] }]);
    expect(a).toMatchObject({ id: "o1", plan: "pro", seatsUsed: 12, status: "past_due", accessState: "grace" });
    expect(JSON.stringify(a)).not.toContain("Ana");
    expect(parseAccounts(null)).toEqual([]);
  });
  it("valor em reais → centavos", () => {
    expect(parseMoneyToCents("99,90")).toBe(9990);
    expect(parseMoneyToCents("R$ 1.234,5")).toBe(123450);
    expect(parseMoneyToCents("120")).toBe(12000);
    expect(parseMoneyToCents("0")).toBeNull();
    expect(parseMoneyToCents("12,345")).toBeNull();
    expect(parseMoneyToCents("abc")).toBeNull();
  });
  it("formulários: conta e pagamento", () => {
    expect(createAccountSchema.safeParse({ business: "Studio X", owner: "Paula", email: "P@X.COM", plan: "pro", limit: "30" }).data?.email).toBe("p@x.com");
    expect(createAccountSchema.safeParse({ business: "S", owner: "Paula", email: "p@x.com", plan: "pro", limit: 30 }).success).toBe(false);
    expect(paymentSchema.safeParse({ paidOn: "2026-11-10", amount: "99,90", periodStart: "2026-11-10", periodEnd: "2026-12-09", note: "" }).success).toBe(true);
    expect(paymentSchema.safeParse({ paidOn: "2026-11-10", amount: "99,90", periodStart: "2026-12-10", periodEnd: "2026-11-09", note: "" }).success).toBe(false);
  });
  it("WhatsApp: número só com dígitos e texto codificado", () => {
    expect(whatsappUrl("Olá & tchau", "+55 41 99901-0287")).toBe("https://wa.me/5541999010287?text=Ol%C3%A1%20%26%20tchau");
    expect(whatsappUrl("oi")).toBe("https://wa.me/?text=oi");
  });
});

describe("assinatura do personal", () => {
  it("estados e somente leitura", () => {
    expect(parseSubscription({ state: "grace", status: "past_due" })).toMatchObject({ state: "grace", status: "past_due" });
    expect(parseSubscription({ state: "lixo" }).state).toBe("ok");
    expect(["ok", "grace"].map((s) => isReadOnly(s as never))).toEqual([false, false]);
    expect(["suspended", "canceled", "closed"].map((s) => isReadOnly(s as never))).toEqual([true, true, true]);
  });
  it("dias restantes da tolerância", () => {
    const now = new Date("2026-11-20T12:00:00Z").getTime();
    expect(daysLeft("2026-11-27T12:00:00Z", now)).toBe(7);
    expect(daysLeft("2026-11-20T13:00:00Z", now)).toBe(1);
    expect(daysLeft(null, now)).toBe(0);
  });
  it("conta encerrada: só o personal, só Configurações/Regularizar/Suporte", () => {
    expect(closedAllows("/configuracoes", "owner")).toBe(true);
    expect(closedAllows("/configuracoes/exportar", "owner")).toBe(true);
    expect(closedAllows("/alunos", "owner")).toBe(false);
    expect(closedAllows("/configuracoes", "trainer")).toBe(false);
  });
  it("mensagem ao aluno com o nome do personal, sem falar de cobrança", () => {
    expect(messages.aluno.limited.banner("Rafael")).toBe("Seu acesso está temporariamente limitado. Fale com Rafael.");
    expect(messages.aluno.limited.banner(null)).toBe("Seu acesso está temporariamente limitado. Fale com seu personal.");
    expect(JSON.stringify(messages.aluno.limited)).not.toMatch(/pagamento|assinatura|cobran/i);
  });
});

describe("migration da plataforma", () => {
  it("regras padrão: 10 dias de tolerância, 30 dias depois de cancelar, 100 convites/dia", () => {
    expect(SQL).toMatch(/past_due_grace_days integer not null default 10/);
    expect(SQL).toMatch(/canceled_access_days integer not null default 30/);
    expect(SQL).toMatch(/invite_daily_limit integer not null default 100/);
  });
  it("lista da plataforma no schema private, sem tela nem RPC para entrar nela", () => {
    expect(SQL).toMatch(/create table private\.platform_admins/);
    expect(SQL).not.toMatch(/insert into private\.platform_admins/);
  });
  it("o gatilho de somente leitura cobre as tabelas de aluno e deixa de fora só as técnicas", () => {
    const block = SQL.slice(SQL.indexOf("and c.table_name not in ("), SQL.indexOf("loop"));
    for (const t of ["students", "workout_sessions", "chat_messages", "feed_posts", "training_plans"]) expect(block).not.toContain(`'${t}'`);
    expect(block).toContain("'audit_logs'");
  });
});
