import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { purgeFeedMedia } from "@/features/feed/media-cleanup";

export const dynamic = "force-dynamic";

/** Comparação em tempo constante do cabeçalho com o segredo. */
function authorized(header: string | null, secret: string) {
  const a = Buffer.from(header ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Limpeza diária do bucket `feed-media` (Vercel Cron, `vercel.json`, 1×/dia): imagens enviadas há mais de 24 h que
 * nenhum post usa e imagens de posts apagados. A Vercel manda `Authorization: Bearer $CRON_SECRET`; sem a variável a
 * rota recusa (fail-closed). Resposta só com contagens.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await purgeFeedMedia(createAdminClient());
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "FAILED" }, { status: 500 });
  }
}
