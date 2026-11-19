import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/db/server";
import { parseSubscription, type MySubscription } from "./subscription";

/** Situação da assinatura da própria conta (staff). Falha → "ok" (o banco continua recusando o que for proibido). */
export const getMySubscription = cache(async (): Promise<MySubscription> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_subscription");
  return parseSubscription(error ? null : data);
});
