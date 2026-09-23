import { z } from "zod";
import { endOfDayBR, parseBRDate, todayISO } from "@/lib/dates";
import { isValidPhone, toE164 } from "@/lib/phone";
import { messages } from "@/messages/pt-BR";

const v = messages.validation;
const f = messages.studentForm.errors;

/**
 * Formulário Novo/Editar aluno. O MESMO schema valida no cliente (React Hook Form)
 * e na server action. Datas ficam em dd/mm/aaaa no formulário.
 */
export const studentFormSchema = z
  .object({
    firstName: z.string().trim().min(1, v.required).max(80),
    lastName: z.string().trim().min(1, v.required).max(120),
    email: z.string().trim().toLowerCase().min(1, v.required).pipe(z.email(v.email)),
    birthDate: z.string().trim(),
    sex: z.enum(["", "M", "F"]),
    phoneCountry: z.string().length(2),
    phone: z.string().trim(),
    trainerId: z.string(),
    groupIds: z.array(z.uuid()),
    healthConsent: z.boolean(),
    /** Somente leitura: o aluno já consentiu antes (edição). */
    consentOnFile: z.boolean(),
    accessExpiresOn: z.string().trim(),
    trainingLocation: z.string().trim().max(200, f.tooLong),
    notes: z.string().trim().max(2000, f.tooLong),
    sendInvite: z.boolean(),
    sendAnamnesis: z.boolean(),
    anamnesisTemplateId: z.string(),
    blockIfOverdue: z.boolean(),
  })
  .superRefine((d, ctx) => {
    if (d.birthDate) {
      const iso = parseBRDate(d.birthDate);
      if (!iso) ctx.addIssue({ code: "custom", path: ["birthDate"], message: f.invalidDate });
      else if (iso > todayISO() || iso < "1900-01-01") ctx.addIssue({ code: "custom", path: ["birthDate"], message: f.birthDateRange });
    }
    if (d.accessExpiresOn && !parseBRDate(d.accessExpiresOn)) {
      ctx.addIssue({ code: "custom", path: ["accessExpiresOn"], message: f.invalidDate });
    }
    if (d.phone && !isValidPhone(d.phone, d.phoneCountry)) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: f.invalidPhone });
    }
    if (d.groupIds.length > 0 && !d.consentOnFile && !d.healthConsent) {
      ctx.addIssue({ code: "custom", path: ["healthConsent"], message: f.consentRequired });
    }
    if (d.sendAnamnesis && !d.anamnesisTemplateId) {
      ctx.addIssue({ code: "custom", path: ["anamnesisTemplateId"], message: f.templateRequired });
    }
  });

export type StudentFormInput = z.input<typeof studentFormSchema>;
export type StudentFormValues = z.output<typeof studentFormSchema>;

export const emptyStudentForm: StudentFormInput = {
  firstName: "",
  lastName: "",
  email: "",
  birthDate: "",
  sex: "",
  phoneCountry: "BR",
  phone: "",
  trainerId: "",
  groupIds: [],
  healthConsent: false,
  consentOnFile: false,
  accessExpiresOn: "",
  trainingLocation: "",
  notes: "",
  sendInvite: true,
  sendAnamnesis: false,
  anamnesisTemplateId: "",
  blockIfOverdue: false,
};

/** Converte o formulário validado no payload das RPCs create_student / update_student. */
export function toStudentPayload(d: StudentFormValues, options: { includeTrainer: boolean }) {
  const expiresISO = d.accessExpiresOn ? parseBRDate(d.accessExpiresOn) : null;
  const payload: Record<string, unknown> = {
    first_name: d.firstName,
    last_name: d.lastName,
    email: d.email,
    birth_date: d.birthDate ? parseBRDate(d.birthDate) : null,
    sex: d.sex || null,
    whatsapp_e164: d.phone ? toE164(d.phone, d.phoneCountry) : null,
    training_location: d.trainingLocation || null,
    notes: d.notes || null,
    access_expires_at: expiresISO ? endOfDayBR(expiresISO) : null,
    block_if_overdue: d.blockIfOverdue,
    group_ids: d.groupIds,
    health_data_consent: d.healthConsent,
  };
  if (options.includeTrainer) payload.trainer_id = d.trainerId || null;
  return payload;
}
