import { describe, expect, it } from "vitest";
import { emptyStudentForm, studentFormSchema, toStudentPayload } from "@/features/students/schemas";
import { maskBRDate, parseBRDate } from "@/lib/dates";
import { formatPhoneDisplay, fromE164, toE164 } from "@/lib/phone";

const GROUP = "2b1f8c1e-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const valid = { ...emptyStudentForm, firstName: "Ana", lastName: "Souza", email: " Ana@Email.com " };
const issues = (input: object) =>
  studentFormSchema.safeParse(input).error?.issues.map((i) => `${i.path.join(".")}: ${i.message}`) ?? [];

describe("schema do formulário de aluno (cliente e servidor)", () => {
  it("aceita o mínimo e normaliza o e-mail", () => {
    const r = studentFormSchema.parse(valid);
    expect(r.email).toBe("ana@email.com");
  });

  it("exige consentimento quando há grupo especial (e dispensa se já registrado)", () => {
    expect(issues({ ...valid, groupIds: [GROUP] })).toEqual([expect.stringContaining("healthConsent")]);
    expect(issues({ ...valid, groupIds: [GROUP], healthConsent: true })).toEqual([]);
    expect(issues({ ...valid, groupIds: [GROUP], consentOnFile: true })).toEqual([]);
  });

  it("rejeita datas impossíveis e nascimento no futuro", () => {
    expect(issues({ ...valid, birthDate: "31/02/2000" })[0]).toContain("birthDate");
    expect(issues({ ...valid, birthDate: "01/01/2999" })[0]).toContain("birthDate");
    expect(issues({ ...valid, accessExpiresOn: "32/12/2026" })[0]).toContain("accessExpiresOn");
  });

  it("valida o WhatsApp conforme o país", () => {
    expect(issues({ ...valid, phone: "123" })[0]).toContain("phone");
    expect(issues({ ...valid, phone: "(41) 99988-7766" })).toEqual([]);
    expect(issues({ ...valid, phoneCountry: "PT", phone: "912 345 678" })).toEqual([]);
  });

  it("anamnese exige modelo", () => {
    expect(issues({ ...valid, sendAnamnesis: true })[0]).toContain("anamnesisTemplateId");
  });
});

describe("payload das RPCs", () => {
  const values = studentFormSchema.parse({
    ...valid,
    birthDate: "15/04/1990",
    phone: "(41) 99988-7766",
    accessExpiresOn: "31/12/2026",
    trainerId: GROUP,
    sex: "F",
  });

  it("converte datas, telefone e campos vazios", () => {
    const p = toStudentPayload(values, { includeTrainer: true });
    expect(p).toMatchObject({
      birth_date: "1990-04-15",
      whatsapp_e164: "+5541999887766",
      access_expires_at: "2026-12-31T23:59:59-03:00",
      sex: "F",
      notes: null,
      training_location: null,
      trainer_id: GROUP,
    });
  });

  it("não envia trainer_id quando o usuário não é owner", () => {
    expect(toStudentPayload(values, { includeTrainer: false })).not.toHaveProperty("trainer_id");
  });
});

describe("helpers de data e telefone", () => {
  it("máscara e parsing dd/mm/aaaa", () => {
    expect(maskBRDate("15041990")).toBe("15/04/1990");
    expect(maskBRDate("15a04")).toBe("15/04");
    expect(parseBRDate("29/02/2024")).toBe("2024-02-29");
    expect(parseBRDate("29/02/2023")).toBeNull();
  });

  it("E.164 ida e volta", () => {
    expect(toE164("(41) 99988-7766", "BR")).toBe("+5541999887766");
    expect(fromE164("+5541999887766")).toEqual({ country: "BR", national: "(41) 99988-7766" });
    expect(fromE164(null)).toEqual({ country: "BR", national: "" });
    expect(formatPhoneDisplay("+351912345678")).toBe("+351 912 345 678");
  });
});
