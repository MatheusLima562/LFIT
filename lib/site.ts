import "server-only";
import { headers } from "next/headers";

/** URL pública do app para montar links (convites). Sem NEXT_PUBLIC_SITE_URL, usa o Host da requisição. */
export async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}
