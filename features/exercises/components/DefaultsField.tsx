"use client";

import { messages } from "@/messages/pt-BR";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatQuantity, formatRestRange, QUANTITY_UNITS, type QuantityUnit } from "@/features/plans/prescription";
import type { ExerciseDefaults } from "../defaults";

const t = messages.exercises.defaults;
const p = messages.plans.prescription;

export interface DefaultsDraft {
  sets: string;
  quantityUnit: QuantityUnit;
  quantityMin: string;
  quantityMax: string;
  restMin: string;
  restMax: string;
}

const s = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
/** Sem camada da equipe, a unidade parte da do padrão LFit (ex.: prancha em segundos). */
export const defaultsDraft = (d: ExerciseDefaults | null, base: ExerciseDefaults | null = null): DefaultsDraft => ({
  sets: s(d?.sets ?? null),
  quantityUnit: d?.quantityUnit ?? base?.quantityUnit ?? "reps",
  quantityMin: s(d?.quantityMin ?? null),
  quantityMax: s(d?.quantityMax ?? null),
  restMin: s(d?.restMin ?? null),
  restMax: s(d?.restMax ?? null),
});

const n = (v: string) => {
  const x = v.trim().replace(",", ".");
  return x === "" ? null : /^\d+(\.\d+)?$/.test(x) ? Number(x) : Number.NaN;
};

/** Rascunho → payload da action; números vazios = null (volta ao padrão LFit), exceto "até a falha". */
export function defaultsPayload(d: DefaultsDraft) {
  const empty = [d.sets, d.quantityMin, d.quantityMax, d.restMin, d.restMax].every((x) => x.trim() === "") && d.quantityUnit !== "failure";
  if (empty) return null;
  return { sets: n(d.sets), quantityUnit: d.quantityUnit, quantityMin: n(d.quantityMin), quantityMax: n(d.quantityMax), restMin: n(d.restMin), restMax: n(d.restMax) };
}

export function DefaultsField({ value, lfit, disabled, onChange }: { value: DefaultsDraft; lfit: ExerciseDefaults | null; disabled?: boolean; onChange: (v: DefaultsDraft) => void }) {
  const field = (k: keyof DefaultsDraft, label: string) => (
    <label className="flex min-w-0 flex-col gap-1 text-[11px] text-ink-3">
      {label}
      <Input className="h-8 text-[13px]" inputMode="decimal" value={value[k]} disabled={disabled} onChange={(e) => onChange({ ...value, [k]: e.target.value })} />
    </label>
  );
  const lfitText = lfit
    ? [
        [lfit.sets ? `${lfit.sets} ×` : null, formatQuantity(lfit.quantityUnit, lfit.quantityMin, lfit.quantityMax, null)].filter(Boolean).join(" "),
        formatRestRange(lfit.restMin, lfit.restMax),
      ]
        .filter(Boolean)
        .join(" · ")
    : null;
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-semibold text-ink">{t.title}</h3>
        <p className="text-xs text-ink-3">
          {t.hint}
          {lfitText ? ` ${t.lfit(lfitText)}` : ""}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {field("sets", t.sets)}
        <label className="flex min-w-0 flex-col gap-1 text-[11px] text-ink-3">
          {p.unit}
          <Select value={value.quantityUnit} disabled={disabled} onValueChange={(u) => onChange({ ...value, quantityUnit: u as QuantityUnit })}>
            <SelectTrigger className="w-full text-[13px] data-[size=default]:h-8" aria-label={`${t.title}: ${p.unit}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUANTITY_UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {p.units[u]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {value.quantityUnit !== "failure" && field("quantityMin", p.min)}
        {value.quantityUnit !== "failure" && field("quantityMax", p.max)}
        {field("restMin", p.restMin)}
        {field("restMax", p.restMax)}
      </div>
    </section>
  );
}
