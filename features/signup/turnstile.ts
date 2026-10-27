import "server-only";

/**
 * Cloudflare Turnstile. Sem chaves configuradas, usa as chaves de TESTE oficiais
 * (sempre aprovam) — apenas fora de produção. Em produção sem chave, recusa.
 * https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 */
const TEST_SECRET = "1x0000000000000000000000000000000AA";
const TEST_SITE_KEY = "1x00000000000000000000AA";

/** Chave pública do widget (lida no servidor e passada ao componente). */
export function turnstileSiteKey() {
  if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  return process.env.NODE_ENV === "production" ? null : TEST_SITE_KEY;
}

/** Turnstile configurado? Sem ele, o cadastro público fica indisponível (fail-closed). */
export const turnstileReady = () => Boolean(turnstileSiteKey() && turnstileSecret());

export function turnstileSecret() {
  if (process.env.TURNSTILE_SECRET_KEY) return process.env.TURNSTILE_SECRET_KEY;
  return process.env.NODE_ENV === "production" ? null : TEST_SECRET;
}

export async function verifyTurnstile(token: string | null | undefined, ip: string) {
  const secret = turnstileSecret();
  if (!secret || !token) return false;

  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip && ip !== "unknown") body.append("remoteip", ip);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false; // fail-closed
  }
}
