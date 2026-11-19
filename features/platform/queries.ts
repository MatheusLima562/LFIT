import "server-only";
import { createClient } from "@/lib/db/server";
import { parseAccountDetail, parseAccounts, type AccountDetail, type PlatformAccount } from "./platform";

/** Contas (RPC exige admin da plataforma; recusa = erro). */
export async function listPlatformAccounts(): Promise<PlatformAccount[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_list_accounts");
  if (error) throw new Error("PLATFORM_LIST_FAILED");
  return parseAccounts(data);
}

export async function getPlatformAccount(id: string): Promise<{ account: PlatformAccount; detail: AccountDetail } | null> {
  const supabase = await createClient();
  const [list, detail] = await Promise.all([supabase.rpc("platform_list_accounts"), supabase.rpc("platform_account_detail", { p_org: id })]);
  if (list.error || detail.error) return null;
  const account = parseAccounts(list.data).find((a) => a.id === id);
  return account ? { account, detail: parseAccountDetail(detail.data) } : null;
}
