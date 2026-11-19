/** Convites dos alunos (lógica pura): status, mensagem editável do WhatsApp. */
export type InviteStatus = "none" | "sent" | "accepted" | "expired";

export const INVITE_DAYS = 7;

export function parseInviteStatus(v: unknown): InviteStatus {
  return v === "sent" || v === "accepted" || v === "expired" ? v : "none";
}

/** Texto padrão (editável na tela). `{nome}` e `{link}` são trocados por aluno. */
export function defaultInviteTemplate(personal: string, business: string): string {
  return `Olá, {nome}! ${personal} convidou você para acompanhar seus treinos no app de ${business}. Crie sua senha por este link (vale ${INVITE_DAYS} dias): {link}`;
}

/** Preenche o modelo. Sem `{link}` no texto, o link vai no fim (nunca sai um convite sem link). */
export function fillInviteMessage(template: string, values: { nome: string; link: string }): string {
  let text = template.replaceAll("{nome}", values.nome).trim();
  text = text.includes("{link}") ? text.replaceAll("{link}", values.link) : `${text} ${values.link}`;
  return text;
}
