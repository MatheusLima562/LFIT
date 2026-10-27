import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security/headers";

const SUPABASE = "https://exemploref.supabase.co";
const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("headers de segurança", () => {
  const prod = contentSecurityPolicy({ supabaseUrl: SUPABASE, isDev: false });

  it("CSP de produção: Supabase (API, Realtime, Storage), Turnstile e players; nada de eval", () => {
    expect(directive(prod, "connect-src")).toContain(SUPABASE);
    expect(directive(prod, "connect-src")).toContain("wss://exemploref.supabase.co");
    expect(directive(prod, "img-src")).toContain(SUPABASE);
    expect(directive(prod, "media-src")).toContain(SUPABASE);
    expect(directive(prod, "script-src")).toContain("https://challenges.cloudflare.com");
    expect(directive(prod, "frame-src")).toContain("https://challenges.cloudflare.com");
    expect(directive(prod, "frame-src")).toContain("https://www.youtube-nocookie.com");
    expect(prod).not.toContain("unsafe-eval");
    expect(directive(prod, "connect-src")).not.toMatch(/ ws:/);
  });

  it("bloqueia ser embutido, plugins e mudança de base/destino de formulário", () => {
    expect(directive(prod, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(prod, "object-src")).toBe("object-src 'none'");
    expect(directive(prod, "base-uri")).toBe("base-uri 'self'");
    expect(directive(prod, "form-action")).toBe("form-action 'self'");
  });

  it("em desenvolvimento libera eval e o WebSocket do recarregamento automático", () => {
    const dev = contentSecurityPolicy({ supabaseUrl: SUPABASE, isDev: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws:");
  });

  it("sem URL do Supabase (ou inválida) não quebra nem libera tudo", () => {
    const csp = contentSecurityPolicy({ supabaseUrl: "nada", isDev: false });
    expect(directive(csp, "connect-src")).toBe("connect-src 'self' https://challenges.cloudflare.com");
    expect(csp).not.toContain("*");
  });

  it("demais headers", () => {
    const h = Object.fromEntries(securityHeaders({ supabaseUrl: SUPABASE, isDev: false }).map((x) => [x.key, x.value]));
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Permissions-Policy"]).toContain("camera=()");
  });
});
