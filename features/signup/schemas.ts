import { z } from "zod";
import { parseBRDate, todayISO } from "@/lib/dates";
import { isValidPhone, toE164 } from "@/lib/phone";
import { messages } from "@/messages/pt-BR";

export const SIGNUP_FIELDS = ["birth_date", "whatsapp_e164", "sex", "training_location", "health_description"] as const;
export type SignupField = (typeof SIGNUP_FIELDS)[number];
export type FieldMode = "hidden" | "optional" | "required";
export type SignupConfig = Record<SignupField, FieldMode>;

export const DEFAULT_SIGNUP_CONFIG: SignupConfig = {
  birth_date: "optional",
  whatsapp_e164: "optional",
  sex: "optional",
  training_location: "hidden",
  health_description: "optional",
};

const fieldModeSchema = z.enum(["hidden", "optional", "required"]);
export const signupConfigSchema = z.object(
  Object.fromEntries(SIGNUP_FIELDS.map((f) => [f, fieldModeSchema])) as Record<SignupField, typeof fieldModeSchema>,
);

/** Lê o form_config do banco com tolerância (campos ausentes = padrão). */
export function parseSignupConfig(raw: unknown): SignupConfig {
  const fields = (raw as { fields?: Record<string, unknown> } | null)?.fields ?? {};
  const merged = { ...DEFAULT_SIGNUP_CONFIG, ...fields };
  const parsed = signupConfigSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SIGNUP_CONFIG;
}

const v = messages.validation;
const f = messages.studentForm.errors;
const p = messages.signup.public;

/** Valores do formulário público. `website` é o honeypot (deve ficar vazio). */
export interface PublicSignupInput {
  firstName: string;
  lastName: string;
  email: string;
  birthDate: string;
  sex: "" | "M" | "F";
  phoneCountry: string;
  phone: string;
  trainingLocation: string;
  healthDescription: string;
  consent: boolean;
  website: string;
}

export const emptyPublicSignup: PublicSignupInput = {
  firstName: "",
  lastName: "",
  email: "",
  birthDate: "",
  sex: "",
  phoneCountry: "BR",
  phone: "",
  trainingLocation: "",
  healthDescription: "",
  consent: false,
  website: "",
};

/** Schema montado a partir da configuração do link (o mesmo no cliente e no servidor). */
export function publicSignupSchema(config: SignupConfig) {
  const required = (field: SignupField) => config[field] === "required";

  return z
    .object({
      firstName: z.string().trim().min(1, v.required).max(80),
      lastName: z.string().trim().min(1, v.required).max(120),
      email: z.string().trim().toLowerCase().min(1, v.required).pipe(z.email(v.email)),
      birthDate: z.string().trim(),
      sex: z.enum(["", "M", "F"]),
      phoneCountry: z.string().length(2),
      phone: z.string().trim(),
      trainingLocation: z.string().trim().max(200),
      healthDescription: z.string().trim().max(1000, f.tooLong),
      consent: z.boolean(),
      website: z.string(),
    })
    .superRefine((d, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
      if (required("birth_date") && !d.birthDate) issue("birthDate", v.required);
      if (required("whatsapp_e164") && !d.phone) issue("phone", v.required);
      if (required("sex") && !d.sex) issue("sex", v.required);
      if (required("training_location") && !d.trainingLocation) issue("trainingLocation", v.required);
      if (required("health_description") && !d.healthDescription) issue("healthDescription", v.required);

      if (d.birthDate) {
        const iso = parseBRDate(d.birthDate);
        if (!iso) issue("birthDate", f.invalidDate);
        else if (iso > todayISO() || iso < "1900-01-01") issue("birthDate", f.birthDateRange);
      }
      if (d.phone && !isValidPhone(d.phone, d.phoneCountry)) issue("phone", f.invalidPhone);
      if (d.healthDescription && config.health_description !== "hidden" && !d.consent) issue("consent", p.consentRequired);
    });
}

/** Payload da RPC submit_public_signup: só campos visíveis e preenchidos. */
export function toSignupPayload(d: PublicSignupInput, config: SignupConfig) {
  const payload: Record<string, string> = { first_name: d.firstName.trim(), last_name: d.lastName.trim(), email: d.email.trim().toLowerCase() };
  const put = (field: SignupField, value: string | null | undefined) => {
    if (config[field] !== "hidden" && value) payload[field] = value;
  };
  put("birth_date", d.birthDate ? parseBRDate(d.birthDate) : null);
  put("whatsapp_e164", d.phone ? toE164(d.phone, d.phoneCountry) : null);
  put("sex", d.sex);
  put("training_location", d.trainingLocation.trim());
  put("health_description", d.healthDescription.trim());
  return payload;
}
