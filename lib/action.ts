import { toast } from "sonner";
import { messages } from "@/messages/pt-BR";

/**
 * Chama uma server action pelo cliente sem derrubar a página. Se a chamada falhar antes de responder (rede caiu,
 * servidor reiniciado, versão nova publicada com outro id de action), a exceção subiria do `startTransition` até o
 * error boundary e a tela inteira viraria "This page couldn't load". Aqui ela vira um aviso e devolve `undefined`.
 * Erros de negócio continuam vindo no retorno da action (`{ ok: false }`), não por exceção.
 */
export async function callAction<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch {
    toast.error(messages.app.actionFailed);
    return undefined;
  }
}
