import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAccountSchema, needsPaymentReview, parseAccounts, parseMoneyToCents, paymentSchema, sortForReview, whatsappUrl } from "@/features/platform/platform";
import { totpCode } from "../../scripts/totp.mts";
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

describe("plataforma: pagamento vencido a revisar (sem mudança automática)", () => {
  const acc = (id: string, status: string, paid_until: string | null) => parseAccounts([{ id, subscription_status: status, paid_until }])[0]!;
  const today = "2026-11-23";
  it("destaca só 'Em dia' com pago até no passado", () => {
    expect(needsPaymentReview(acc("a", "active", "2026-11-22"), today)).toBe(true);
    expect(needsPaymentReview(acc("b", "active", "2026-11-23"), today)).toBe(false); // hoje ainda coberto
    expect(needsPaymentReview(acc("c", "active", null), today)).toBe(false); // sem pagamento registrado
    expect(needsPaymentReview(acc("d", "past_due", "2026-10-01"), today)).toBe(false); // já marcada em atraso
    expect(needsPaymentReview(acc("e", "suspended", "2026-10-01"), today)).toBe(false);
  });
  it("ordena as contas a revisar primeiro (vencidas há mais tempo no topo), resto na ordem original", () => {
    const list = [acc("novo", "active", null), acc("v1", "active", "2026-11-20"), acc("ok", "active", "2026-12-20"), acc("v2", "active", "2026-10-05"), acc("atraso", "past_due", "2026-09-01")];
    expect(sortForReview(list, today).map((a) => a.id)).toEqual(["v2", "v1", "novo", "ok", "atraso"]);
  });
  it("selo e dica em pt-BR", () => {
    expect(messages.platform.paymentReview).toBe("Pagamento vencido, revisar");
    expect(messages.platform.paymentReviewHint("22/11/2026")).toContain("22/11/2026");
  });
});

describe("gatilho org_writable: exceções", () => {
  it("as exceções da migration são exatamente as documentadas no CLAUDE.md", () => {
    const md = readFileSync(join(process.cwd(), "CLAUDE.md"), "utf8");
    const line = md.split("\n").find((l) => l.includes("Exceções do gatilho org_writable:"))!;
    const documented = [...line.matchAll(/`([a-z][a-z0-9_]*)`/g)].map((m) => m[1]).sort();
    const block = SQL.slice(SQL.indexOf("and c.table_name not in ("), SQL.indexOf("loop"));
    expect([...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()).toEqual(documented);
  });
});

describe("plataforma: MFA obrigatório", () => {
  it("toda RPC da plataforma passa por require_platform_admin, que exige aal2", () => {
    const req = SQL.slice(SQL.indexOf("create function private.require_platform_admin()"), SQL.indexOf("create function private.platform_log("));
    expect(req).toContain("not private.platform_mfa_ok()");
    expect(SQL).toContain("(select auth.jwt()) ->> 'aal', '') = 'aal2'");
    for (const fn of ["platform_list_accounts", "platform_account_detail", "platform_create_account", "platform_account_owner", "platform_log_invite", "platform_update_plan", "platform_record_payment", "platform_set_status", "platform_set_note"]) {
      const body = SQL.slice(SQL.indexOf(`create function public.${fn}(`));
      expect(body.slice(0, body.indexOf("$$;")), fn).toContain("perform private.require_platform_admin()");
    }
    // O passe livre do gatilho de somente leitura também exige aal2.
    expect(SQL).toContain("private.is_platform_admin() and private.platform_mfa_ok()");
  });
  it("TOTP de teste segue a RFC 6238 (vetor oficial, 6 dígitos)", () => {
    // Chave ASCII "12345678901234567890" em base32; T = 59 s → 94287082 → últimos 6 dígitos.
    expect(totpCode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000)).toBe("287082");
    expect(totpCode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 1_111_111_109_000)).toBe("081804");
  });
});
