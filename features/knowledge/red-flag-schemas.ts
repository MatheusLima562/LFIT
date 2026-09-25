import { z } from "zod";
import { parseBRDate } from "@/lib/dates";
import { messages } from "@/messages/pt-BR";
import { CLEARANCE_KINDS, RED_FLAG_KEYS, RED_FLAG_NOTE_MAX, type RedFlagKey } from "./red-flags";

const t = messages.redFlags;

export const redFlagCheckSchema = z
  .object({
    items: z.array(z.enum(RED_FLAG_KEYS as [RedFlagKey, ...RedFlagKey[]])).max(RED_FLAG_KEYS.length),
    noneObserved: z.boolean(),
    note: z.string().trim().max(RED_FLAG_NOTE_MAX, t.noteTooLong),
  })
  .superRefine((d, ctx) => {
    // "Nenhum destes sinais" é uma escolha explícita, não a ausência de marcação.
    if (d.noneObserved === d.items.length > 0) ctx.addIssue({ code: "custom", path: ["items"], message: t.chooseOne });
  });
export type RedFlagCheckValues = z.infer<typeof redFlagCheckSchema>;

export const redFlagClearanceSchema = z.object({
  kind: z.enum(CLEARANCE_KINDS, { message: t.kindRequired }),
  name: z.string().trim().min(2, t.nameRequired).max(120),
  on: z.string().refine((v) => parseBRDate(v) !== null, t.dateInvalid),
  note: z.string().trim().max(RED_FLAG_NOTE_MAX, t.noteTooLong),
});
export type RedFlagClearanceValues = z.infer<typeof redFlagClearanceSchema>;
