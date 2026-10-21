/**
 * Headers de segurança de todas as respostas (aplicados em next.config.ts). Lógica pura, testada em
 * tests/unit/security-headers.test.ts.
 *
 * CSP — o que cada origem externa faz:
 * - Supabase (NEXT_PUBLIC_SUPABASE_URL): API/Auth (`connect-src`), Realtime do chat (`wss:`), fotos e vídeos por URL
 *   assinada do Storage (`img-src`, `media-src`).
 * - Cloudflare Turnstile (cadastro público): script e iframe em challenges.cloudflare.com.
 * - Vídeos de exercício e de tutorial: iframes do YouTube (nocookie), Vimeo e Loom — só carregam no clique.
 * Scripts e estilos inline: o Next injeta scripts de hidratação e estilos inline sem nonce; trocar por CSP com nonce
 * exige render dinâmico em todas as páginas (anotado no backlog). Em desenvolvimento, `unsafe-eval` e o WebSocket do
 * recarregamento automático também entram.
 */
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
export const VIDEO_FRAME_ORIGINS = ["https://www.youtube-nocookie.com", "https://player.vimeo.com", "https://www.loom.com"];

export interface SecurityHeadersInput {
  /** NEXT_PUBLIC_SUPABASE_URL (ex.: https://<ref>.supabase.co). */
  supabaseUrl: string | undefined;
  isDev: boolean;
}

function origin(url: string | undefined): string | null {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy({ supabaseUrl, isDev }: SecurityHeadersInput): string {
  const supabase = origin(supabaseUrl);
  const supabaseWs = supabase ? supabase.replace(/^https:/, "wss:").replace(/^http:/, "ws:") : null;
  const list = (...items: (string | null | false)[]) => items.filter(Boolean).join(" ");
  const directives: Record<string, string> = {
    "default-src": "'self'",
    "script-src": list("'self'", "'unsafe-inline'", isDev && "'unsafe-eval'", TURNSTILE_ORIGIN),
    "style-src": "'self' 'unsafe-inline'",
    "img-src": list("'self'", "data:", "blob:", supabase),
    "media-src": list("'self'", "blob:", supabase),
    "font-src": "'self' data:",
    "connect-src": list("'self'", supabase, supabaseWs, TURNSTILE_ORIGIN, isDev && "ws:"),
    "frame-src": list(TURNSTILE_ORIGIN, ...VIDEO_FRAME_ORIGINS),
    "worker-src": "'self' blob:",
    "object-src": "'none'",
    "base-uri": "'self'",
    "form-action": "'self'",
    "frame-ancestors": "'none'",
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v}`)
    .join("; ");
}

export function securityHeaders(input: SecurityHeadersInput): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(input) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Equivalente antigo do frame-ancestors 'none' (navegadores sem CSP nível 2).
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  ];
}
