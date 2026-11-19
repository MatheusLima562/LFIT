/**
 * Notificações N1 (dentro do app, sem push). Regras puras, testadas em `tests/unit/notifications-n1.test.ts`.
 * Nada de conteúdo: o aviso diz só "Nova mensagem" / "Novo recado" — nunca o texto, nem dado de saúde.
 */

/** Toast de mensagem nova: a contagem de não lidas subiu e a pessoa não está na conversa. */
export function shouldToastNewMessage(previous: number, next: number, onChat: boolean): boolean {
  return !onChat && next > previous;
}

export interface AnnouncementNoticeInput {
  /** Recado visível agora (id) ou null. */
  currentId: string | null;
  /** Último recado que o aluno viu na tela Hoje (id guardado no aparelho). */
  seenId: string | null;
  /** Último recado já avisado por toast neste aparelho. */
  notifiedId: string | null;
  onToday: boolean;
}

/** Marcador na aba Hoje até o aluno ver o recado; toast uma vez por recado, fora da Hoje. */
export function announcementNotice({ currentId, seenId, notifiedId, onToday }: AnnouncementNoticeInput) {
  const unseen = currentId !== null && currentId !== seenId && !onToday;
  return { dot: unseen, toast: unseen && currentId !== notifiedId };
}
