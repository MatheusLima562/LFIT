import "server-only";
import { createClient } from "@/lib/db/server";

export interface ImportBatchSummary {
  id: string;
  createdAt: string;
  sourceLabel: string;
  created: number;
  rejected: number;
  undoneAt: string | null;
  archived: number | null;
  kept: number | null;
}

/** Lotes dos últimos 30 dias que o chamador vê (RLS: owner = organização; professor = os próprios). Só contagens. */
export async function getRecentImportBatches(): Promise<ImportBatchSummary[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("import_batches")
    .select("id, created_at, source_label, created_count, rejected_count, undone_at, archived_count, kept_count")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error || !data) return [];
  return data.map((b) => ({
    id: b.id,
    createdAt: b.created_at,
    sourceLabel: b.source_label,
    created: b.created_count,
    rejected: b.rejected_count,
    undoneAt: b.undone_at,
    archived: b.archived_count,
    kept: b.kept_count,
  }));
}
