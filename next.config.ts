import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Os tutoriais (/ajuda) são lidos do disco em tempo de execução: garante que os .md entram no bundle do servidor.
  outputFileTracingIncludes: {
    "/ajuda": ["./content/tutoriais/**/*.md"],
    "/ajuda/*": ["./content/tutoriais/**/*.md"],
  },
};

export default nextConfig;
