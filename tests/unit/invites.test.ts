import { describe, expect, it } from "vitest";
import { defaultInviteTemplate, fillInviteMessage, parseInviteStatus } from "@/features/students/invites";
import { whatsappUrl } from "@/features/platform/platform";

describe("convites (lógica pura)", () => {
  it("modelo padrão com {nome} e {link}, em pt-BR, citando os 7 dias", () => {
    const tpl = defaultInviteTemplate("Rafael", "Studio Exemplo");
    expect(tpl).toContain("{nome}");
    expect(tpl).toContain("{link}");
    expect(tpl).toContain("7 dias");
    expect(fillInviteMessage(tpl, { nome: "Ana", link: "https://app/acesso/abc" })).toBe(
      "Olá, Ana! Rafael convidou você para acompanhar seus treinos no app de Studio Exemplo. Crie sua senha por este link (vale 7 dias): https://app/acesso/abc",
    );
  });
  it("texto editado sem {link}: o link vai no fim (nunca sai convite sem link)", () => {
    expect(fillInviteMessage("Oi {nome}, bora treinar!", { nome: "Bia", link: "https://x/y" })).toBe("Oi Bia, bora treinar! https://x/y");
  });
  it("status desconhecido vira 'none'", () => {
    expect(parseInviteStatus("sent")).toBe("sent");
    expect(parseInviteStatus("lixo")).toBe("none");
  });
  it("link do WhatsApp com a mensagem pronta para o número do aluno", () => {
    expect(whatsappUrl(fillInviteMessage("Oi {nome} {link}", { nome: "Ana", link: "https://x/a" }), "+5541999990000")).toBe(
      "https://wa.me/5541999990000?text=Oi%20Ana%20https%3A%2F%2Fx%2Fa",
    );
  });
});
