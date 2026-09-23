import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/db/admin";

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

interface Rule {
  key: string;
  max: number;
  windowSeconds: number;
}

/**
 * Aplica várias regras de rate limit (janela fixa, contadas no Postgres).
 * Retorna false se qualquer uma estourar. Em caso de falha do banco, bloqueia
 * (fail-closed) — preferível a permitir força bruta.
 */
export async function withinRateLimit(rules: Rule[]): Promise<boolean> {
  const admin = createAdminClient();
  const results = await Promise.all(
    rules.map((r) =>
      admin.rpc("hit_rate_limit", { p_key: r.key, p_max: r.max, p_window_seconds: r.windowSeconds }),
    ),
  );
  return results.every((r) => !r.error && r.data === true);
}
