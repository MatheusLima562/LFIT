import { GUIDES } from "./guides";
import type { Guide } from "./types";

export const GUIDE_KEYS = Object.keys(GUIDES);

/** Guia da própria condição (chave global) ou, se não houver, o da região (pai). */
export function guideKeyFor(condition: { key: string | null; parentKey: string | null }): string | null {
  if (condition.key && GUIDES[condition.key]) return condition.key;
  if (condition.key && condition.parentKey && GUIDES[condition.parentKey]) return condition.parentKey;
  return null;
}

export function getGuide(key: string): Guide | null {
  return Object.hasOwn(GUIDES, key) ? GUIDES[key] : null;
}
