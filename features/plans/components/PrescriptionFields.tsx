"use client";

import type React from "react";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PrescriptionDraft } from "../builder";
import { INTEGER_UNITS, INTENSITY_RANGE, INTENSITY_TYPES, QUANTITY_UNITS, SPEED_PRESETS, type IntensityType, type QuantityUnit, type SpeedPreset } from "../prescription";

const p = messages.plans.prescription;
const NONE = "__none__";
const small = "h-8 text-[13px]";
const selectSmall = "w-full text-[13px] data-[size=default]:h-8";

interface Props {
  idPrefix: string;
  value: PrescriptionDraft;
  readOnly: boolean;
  /** Mensagem de erro do campo (chave do rascunho: qtyMin, intensityValue…). */
  error: (field: string) => string | undefined;
  onChange: (patch: Partial<PrescriptionDraft>) => void;
}

/**
 * Prescrição comum ao resumo do item e a cada série. A unidade muda o rótulo e o teclado da
 * quantidade ("até a falha" não tem quantidade); velocidade por preset OU cadência (um exclui o outro).
 */
export function PrescriptionFields({ idPrefix, value: v, readOnly, error, onChange }: Props) {
  const id = (f: string) => `${idPrefix}-${f}`;
  const unitLabel = p.units[v.quantityUnit];
  const integer = INTEGER_UNITS.includes(v.quantityUnit);
  const range = v.intensityType ? INTENSITY_RANGE[v.intensityType] : null;

  const input = (f: keyof PrescriptionDraft, label: React.ReactNode, opts: { inputMode?: "numeric" | "decimal" | "text"; maxLength?: number; placeholder?: string; disabled?: boolean } = {}) => (
    <label htmlFor={id(f)} className="flex min-w-0 flex-col gap-1 text-[11px] text-ink-3">
      {label}
      <Input
        id={id(f)}
        className={small}
        value={v[f] as string}
        inputMode={opts.inputMode}
        maxLength={opts.maxLength}
        placeholder={opts.placeholder}
        disabled={readOnly || opts.disabled}
        aria-invalid={!!error(f)}
        onChange={(e) => onChange({ [f]: e.target.value } as Partial<PrescriptionDraft>)}
      />
    </label>
  );

  const errors = (["qtyMin", "qtyMax", "qtyNote", "intensityValue", "tempo", "restMin", "restMax"] as const)
    .map((f) => error(f))
    .filter(Boolean);

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-[8.5rem_4.5rem_4.5rem_minmax(6rem,1fr)_8.5rem_4.5rem_8.5rem_4.5rem_4.5rem]">
        <label htmlFor={id("unit")} className="flex min-w-0 flex-col gap-1 text-[11px] text-ink-3">
          {p.unit}
          <Select value={v.quantityUnit} disabled={readOnly} onValueChange={(u) => onChange({ quantityUnit: u as QuantityUnit })}>
            <SelectTrigger id={id("unit")} className={selectSmall}>
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
        {v.quantityUnit === "failure" ? (
          <p className="col-span-2 self-end pb-2 text-[12px] text-ink-3 sm:col-span-2">{p.units.failure}</p>
        ) : (
          <>
            {input(
              "qtyMin",
              <>
                <span className="sr-only">{unitLabel} · </span>
                {p.min}
              </>,
              { inputMode: integer ? "numeric" : "decimal" },
            )}
            {input("qtyMax", p.max, { inputMode: integer ? "numeric" : "decimal" })}
          </>
        )}
        {input("qtyNote", p.note, { maxLength: 40, placeholder: p.notePlaceholder })}

        <label htmlFor={id("itype")} className="flex min-w-0 flex-col gap-1 text-[11px] text-ink-3">
          {p.intensity}
          <Select
            value={v.intensityType || NONE}
            disabled={readOnly}
            onValueChange={(t) => onChange({ intensityType: t === NONE ? "" : (t as IntensityType), ...(t === NONE ? { intensityValue: "" } : {}) })}
          >
            <SelectTrigger id={id("itype")} className={selectSmall}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{p.noIntensity}</SelectItem>
              {INTENSITY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {p.intensityTypes[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {input("intensityValue", range ? `${p.intensityValue} (${range.min}–${range.max})` : p.intensityValue, {
          inputMode: "decimal",
          disabled: !v.intensityType,
        })}

        <div className="flex min-w-0 flex-col gap-1 text-[11px] text-ink-3">
          <div role="radiogroup" aria-label={p.speed} className="flex gap-2">
            {(["preset", "tempo"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={v.speedMode === m}
                disabled={readOnly}
                onClick={() => onChange(m === "preset" ? { speedMode: m, tempo: "" } : { speedMode: m, speed: "" })}
                className={cn("rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/50", v.speedMode === m ? "font-semibold text-ink" : "text-ink-3 hover:text-ink")}
              >
                {p.speedMode[m]}
              </button>
            ))}
          </div>
          {v.speedMode === "preset" ? (
            <Select value={v.speed || NONE} disabled={readOnly} onValueChange={(s) => onChange({ speed: s === NONE ? "" : (s as SpeedPreset) })}>
              <SelectTrigger aria-label={p.speed} className={selectSmall}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{p.noSpeed}</SelectItem>
                {SPEED_PRESETS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {p.speeds[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              aria-label={p.speedMode.tempo}
              className={small}
              value={v.tempo}
              maxLength={4}
              placeholder="3010"
              disabled={readOnly}
              aria-invalid={!!error("tempo")}
              onChange={(e) => onChange({ tempo: e.target.value })}
            />
          )}
        </div>

        {input("restMin", p.restMin, { inputMode: "numeric" })}
        {input("restMax", p.restMax, { inputMode: "numeric" })}
      </div>
      {errors.map((e, i) => (
        <span key={i} className="text-xs text-destructive">
          {e}
        </span>
      ))}
    </div>
  );
}
