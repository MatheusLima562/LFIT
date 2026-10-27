import type { StudentRule } from "./queries";

export const CARE_NOTE_MAX = 300;
const STOP_RULE = "Se a dor passar de 3/10, pare e avise o professor.";

/**
 * Sugestão de "Orientação de cuidado ao aluno" a partir do alerta do item, em linguagem positiva e sem citar condição,
 * nível ou grupo (é o texto que o aluno vai ver). O professor edita e aprova; só o texto aprovado chega ao app.
 * Nulo quando não há alerta visível (sem regra ou só nível restrito).
 */
export function suggestCareNote(rules: Pick<StudentRule, "level" | "note" | "restricted">[]): string | null {
  const visible = rules.filter((r) => !r.restricted);
  if (!visible.length) return null;
  const worst = visible.find((r) => r.level === "avoid") ?? visible[0];
  const note = worst.note
    ?.replace(/\s*\(exemplo do seed\)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.;:,\s]+$/, "");
  const lead = note ? `${note}.` : "Faça com amplitude confortável e sem pressa.";
  return `${lead} ${STOP_RULE}`.slice(0, CARE_NOTE_MAX);
}
