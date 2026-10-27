import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security/headers";

const nextConfig: NextConfig = {
  // Os tutoriais (/ajuda) são lidos do disco em tempo de execução: garante que os .md entram no bundle do servidor.
  outputFileTracingIncludes: {
    "/ajuda": ["./content/tutoriais/**/*.md"],
    "/ajuda/*": ["./content/tutoriais/**/*.md"],
  },
  poweredByHeader: false,
  // Headers de segurança em todas as respostas (CSP compatível com Supabase, Turnstile e vídeos; ver lib/security/headers.ts).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({ supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, isDev: process.env.NODE_ENV !== "production" }),
      },
    ];
  },
};

export default nextConfig;
