import { searchKey } from "@/lib/text";

/** Campos mínimos para agrupar condições por região (parent_id) e buscar por sinônimos. */
export interface RegionNode {
  id: string;
  name: string;
  parentId: string | null;
  searchTerms: string[];
}

/** Regiões em ordem alfabética, cada uma seguida das suas condições; órfãs (pai arquivado/invisível) no fim. */
export function orderByRegion<T extends RegionNode>(items: T[]): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, "pt-BR");
  const ids = new Set(items.map((i) => i.id));
  const roots = items.filter((i) => !i.parentId || !ids.has(i.parentId)).sort(byName);
  const children = new Map<string, T[]>();
  for (const i of items) {
    if (i.parentId && ids.has(i.parentId)) children.set(i.parentId, [...(children.get(i.parentId) ?? []), i]);
  }
  return roots.flatMap((r) => [r, ...(children.get(r.id) ?? []).sort(byName)]);
}

/** Busca sem acento no nome, nos sinônimos e no nome da região. */
export function matchesCondition<T extends RegionNode>(item: T, query: string, all: T[]): boolean {
  const q = searchKey(query.trim());
  if (!q) return true;
  const parent = item.parentId ? all.find((p) => p.id === item.parentId) : undefined;
  return [item.name, ...item.searchTerms, parent?.name ?? ""].some((s) => searchKey(s).includes(q));
}

/** "a, b ,, c" → ["a", "b", "c"] (sem repetidos, sem vazios). */
export function parseSearchTerms(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(",")) {
    const term = raw.trim().replace(/\s+/g, " ");
    const key = searchKey(term);
    if (term && !seen.has(key)) {
      seen.add(key);
      out.push(term);
    }
  }
  return out;
}
