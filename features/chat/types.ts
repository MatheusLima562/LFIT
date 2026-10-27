/**
 * Mensagem do chat como o app a recebe: linha da tabela (Realtime, retorno de `send_chat_message`) ou de
 * `get_chat_messages`. Escrito à mão, fora de `lib/db/types.ts`: o gerador marca toda coluna de RETURNS TABLE como
 * não nula, e aqui os nulos importam (mensagem do aluno sem `sender_id`, mensagem sem anexo).
 */
export interface ChatMessage {
  id: string;
  organization_id: string;
  student_id: string;
  /** "student" | "staff" (texto no banco; `fromRow` normaliza). */
  sender_role: string;
  /** profiles.id de quem enviou; nulo nas mensagens do aluno. */
  sender_id: string | null;
  body: string;
  attached_item_id: string | null;
  attached_exercise_name: string | null;
  created_at: string;
  client_msg_id: string;
  /**
   * Primeiro nome de quem enviou (só staff), vindo de `get_chat_messages`. Ausente nas linhas do Realtime e do
   * retorno do envio; nulo nas mensagens do aluno.
   */
  sender_first_name?: string | null;
}
