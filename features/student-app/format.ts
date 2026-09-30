import { formatLoad } from "@/features/plans/format";
import { formatQuantity, formatRestRange } from "@/features/plans/prescription";
import type { SetType } from "@/features/plans/schemas";
import { messages } from "@/messages/pt-BR";
import type { AppItem } from "./types";

/** Meta de uma série no app do aluno (texto pronto + valores para pré-preencher o registro). */
export interface SetTarget {
  index: number;
  setType: SetType;
  quantity: string | null;
  load: string | null;
  intensity: string | null;
  /** Descanso sugerido depois da série (o mínimo da faixa). */
  restSeconds: number | null;
  rest: string | null;
  /** Unidade da quantidade: "reps", "s"... (vazio em "até a falha"). */
  unitSuffix: string;
  defaultQuantity: number | null;
  defaultLoad: number | null;
  defaultLoadUnit: "kg" | "lb";
}

/** Uma meta por série: as séries detalhadas, se houver; senão `sets` × a prescrição do item. */
export function setTargets(item: AppItem): SetTarget[] {
  const suffix = (u: AppItem["quantity_unit"]) => messages.plans.prescription.suffix[u];
  if (item.sets_detail.length) {
    return item.sets_detail.map((s, i) => ({
      index: i + 1,
      setType: s.set_type,
      quantity: formatQuantity(s.quantity_unit, s.quantity_min, s.quantity_max, s.quantity_note),
      load: formatLoad(s.load_value, s.load_unit, s.load_text),
      intensity: s.intensity,
      restSeconds: s.rest_min,
      rest: formatRestRange(s.rest_min, s.rest_max),
      unitSuffix: suffix(s.quantity_unit),
      defaultQuantity: s.quantity_unit === "failure" ? null : (s.quantity_max ?? s.quantity_min),
      defaultLoad: s.load_value,
      defaultLoadUnit: s.load_unit ?? item.load_unit ?? "kg",
    }));
  }
  const count = Math.max(1, item.sets ?? 1);
  return Array.from({ length: count }, (_, i) => ({
    index: i + 1,
    setType: "work" as SetType,
    quantity: formatQuantity(item.quantity_unit, item.quantity_min, item.quantity_max, item.quantity_note),
    load: formatLoad(item.load_value, item.load_unit, item.load_text),
    intensity: item.intensity,
    restSeconds: item.rest_min,
    rest: formatRestRange(item.rest_min, item.rest_max),
    unitSuffix: suffix(item.quantity_unit),
    defaultQuantity: item.quantity_unit === "failure" ? null : (item.quantity_max ?? item.quantity_min),
    defaultLoad: item.load_value,
    defaultLoadUnit: item.load_unit ?? "kg",
  }));
}

/** Resumo do item: "3 × 10–12 reps · 40 kg · RPE 8 · 60 s". */
export function itemSummary(item: AppItem): string {
  const t = setTargets(item)[0];
  const count = item.sets_detail.length || Math.max(1, item.sets ?? 1);
  return [
    t.quantity ? `${count} × ${t.quantity}` : `${count} ×`,
    t.load,
    t.intensity,
    t.rest,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Dor > 5 = orientação de parar e aviso ao professor (regra de `docs/conhecimento/lombalgia-inespecifica.md`, 2.4). */
export const PAIN_ALERT_ABOVE = 5;

/** "12,5" / "12.5" → 12.5; vazio ou inválido → null. */
export function parseDecimal(value: string): number | null {
  const v = value.trim().replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
