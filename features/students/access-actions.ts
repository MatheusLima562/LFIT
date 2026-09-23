"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/db/admin";
import { clientIp, withinRateLimit } from "@/lib/security/rate-limit";
import { messages } from "@/messages/pt-BR";
import { AccountConflictError, generateSetPasswordToken, type StudentAccountTarget } from "./account";

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * Consome o link de acesso (uso único) e leva o aluno a "definir senha".
 * Chamado por POST (botão), nunca no GET: pré-visualizações de links (WhatsApp,
 * e-mail) fazem GET e gastariam o token antes do aluno abrir.
 */
export async function redeemAccessLink(token: string): Promise<{ error: string } | { url: string }> {
  if (!tokenSchema.safeParse(token).success) return { error: messages.access.invalid };

  const ip = await clientIp();
  if (!(await withinRateLimit([{ key: `access-link:ip:${ip}`, max: 20, windowSeconds: 15 * 60 }]))) {
    return { error: messages.auth.errors.rateLimited };
  }

  const admin = createAdminClient();
  const { data } = await admin.rpc("consume_access_link", { p_token: token });
  const target = (data as StudentAccountTarget[] | null)?.[0];
  if (!target) return { error: messages.access.invalid };

  let link: Awaited<ReturnType<typeof generateSetPasswordToken>>;
  try {
    link = await generateSetPasswordToken(admin, target);
  } catch (e) {
    return { error: e instanceof AccountConflictError ? messages.students.actions.emailInUse : messages.auth.errors.generic };
  }

  // Navegação completa (documento) no cliente: o /auth/confirm é um Route Handler que grava
  // os cookies da sessão; via redirect() de Server Action ele rodaria numa busca RSC.
  return { url: `/auth/confirm?token_hash=${link.tokenHash}&type=${link.type}&next=/convite` };
}
