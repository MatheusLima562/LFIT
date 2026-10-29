import { describe, expect, it } from "vitest";
import { signInErrorMessage } from "@/features/auth/schemas";
import { messages } from "@/messages/pt-BR";

const t = messages.auth.errors;

describe("signInErrorMessage", () => {
  it("limite do Supabase Auth vira 'muitas tentativas', não 'senha incorreta'", () => {
    expect(signInErrorMessage({ status: 429 })).toBe(t.rateLimited);
    expect(signInErrorMessage({ status: 400, code: "over_request_rate_limit" })).toBe(t.rateLimited);
  });
  it("credencial errada e erro desconhecido continuam genéricos", () => {
    expect(signInErrorMessage({ status: 400, code: "invalid_credentials" })).toBe(t.invalidCredentials);
    expect(signInErrorMessage(null)).toBe(t.invalidCredentials);
  });
});
