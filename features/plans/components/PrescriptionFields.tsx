"use client";

import { ChevronDown } from "lucide-react";
import { Fragment, useId } from "react";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PrescriptionDraft } from "../builder";
import { INTENSITY_MAX, LOAD_UNITS, type LoadUnit } from "../schemas";
import { INTEGER_UNITS, QUANTITY_UNITS, SPEED_PRESETS, type QuantityUnit, type SpeedPreset } from "../prescription";

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

type Fields = keyof PrescriptionDraft;

function Errors({ error, fields }: { error: Props["error"]; fields: readonly Fields[] }) {
  const list = fields.map((f) => error(f)).filter(Boolean);
  return list.map((e, i) => (
    <span key={i} className="text-xs text-destructive">
      {e}
    </span>
  ));
}

/** Dois campos (mín–máx) sob um rótulo só: "Repetições 10 – 12", "Pausa (s) 60 – 90". */
function RangeInputs({
  idPrefix,
  label,
  min,
  max,
  value: v,
  readOnly,
  error,
  onChange,
  inputMode,
}: Props & { label: string; min: Fields; max: Fields; inputMode: "numeric" | "decimal" }) {
  const id = (f: string) => `${idPrefix}-${f}`;
  return (
    <div role="group" aria-labelledby={id(`${min}-label`)} className="flex min-w-0 flex-col gap-1 text-[11px] text-ink-3">
      <span id={id(`${min}-label`)}>{label}</span>
      <div className="flex items-center gap-1">
        {([min, max] as const).map((f, i) => (
          <Fragment key={f}>
            {i === 1 && <span aria-hidden>–</span>}
            <Input
              id={id(f)}
              aria-label={`${label} ${i === 0 ? p.min : p.max}`}
              className={cn(small, "w-16 min-w-0")}
              value={v[f] as string}
              inputMode={inputMode}
              placeholder={i === 0 ? p.min : p.max}
              disabled={readOnly}
              aria-invalid={!!error(f)}
              onChange={(e) => onChange({ [f]: e.target.value } as Partial<PrescriptionDraft>)}
            />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** Básico: quantidade mín–máx (rótulo = unidade; "até a falha" sem campos). */
export function QuantityRange(props: Props) {
  const v = props.value;
  if (v.quantityUnit === "failure")
    return (
      <div className="flex min-w-0 flex-col gap-1 text-[11px] text-ink-3">
        <span>{p.quantity}</span>
        <span className="flex h-8 items-center text-[13px] text-ink-2">{p.units.failure}</span>
      </div>
    );
  return (
    <RangeInputs {...props} label={p.units[v.quantityUnit]} min="qtyMin" max="qtyMax" inputMode={INTEGER_UNITS.includes(v.quantityUnit) ? "numeric" : "decimal"} />
  );
}

/** Básico: intensidade em texto curto livre ("RPE 8", "RIR 2", "70%"), ao lado da carga. */
export function IntensityInput({ idPrefix, value: v, readOnly, error, onChange }: Props) {
  const id = `${idPrefix}-intensity`;
  return (
    <label htmlFor={id} className="flex w-24 flex-col gap-1 text-[11px] text-ink-3">
      {p.intensity}
      <Input
        id={id}
        className={small}
        value={v.intensity}
        maxLength={INTENSITY_MAX}
        placeholder={p.intensityPlaceholder}
        disabled={readOnly}
        aria-invalid={!!error("intensity")}
        onChange={(e) => onChange({ intensity: e.target.value })}
      />
    </label>
  );
}

/** Básico: pausa mín–máx em segundos. */
export function RestRange(props: Props) {
  return <RangeInputs {...props} label={p.rest} min="restMin" max="restMax" inputMode="numeric" />;
}

export function BasicErrors({ error }: { error: Props["error"] }) {
  return <Errors error={error} fields={["qtyMin", "qtyMax", "intensity", "restMin", "restMax"]} />;
}

/** Quantos campos de "Mais opções" da prescrição estão preenchidos (abre sozinho se > 0). */
export function prescriptionExtras(v: PrescriptionDraft) {
  return [v.quantityUnit !== "reps", v.qtyNote.trim(), v.speed || v.tempo.trim() || v.speedMode === "tempo"].filter(Boolean).length;
}

/**
 * "Mais opções" da prescrição: unidade, complemento, velocidade OU cadência.
 * A unidade muda o rótulo e o teclado da quantidade ("até a falha" não tem quantidade).
 */
export function PrescriptionMore({ idPrefix, value: v, readOnly, error, onChange }: Props) {
  const id = (f: string) => `${idPrefix}-${f}`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <label htmlFor={id("unit")} className="flex w-36 flex-col gap-1 text-[11px] text-ink-3">
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
        <label htmlFor={id("qtyNote")} className="flex w-44 flex-col gap-1 text-[11px] text-ink-3">
          {p.note}
          <Input
            id={id("qtyNote")}
            className={small}
            value={v.qtyNote}
            maxLength={40}
            placeholder={p.notePlaceholder}
            disabled={readOnly}
            aria-invalid={!!error("qtyNote")}
            onChange={(e) => onChange({ qtyNote: e.target.value })}
          />
        </label>

        <div className="flex w-36 flex-col gap-1 text-[11px] text-ink-3">
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
      </div>
      <Errors error={error} fields={["qtyNote", "tempo"]} />
    </div>
  );
}

/** Carga: valor + unidade (o texto livre fica em "Mais opções"). */
export function LoadInputs({
  label,
  value,
  unit,
  readOnly,
  invalid,
  onValue,
  onUnit,
}: {
  label: string;
  value: string;
  unit: LoadUnit;
  readOnly: boolean;
  invalid: boolean;
  onValue: (v: string) => void;
  onUnit: (u: LoadUnit) => void;
}) {
  const labelId = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1 text-[11px] text-ink-3">
      <span id={labelId}>{messages.plans.items.load}</span>
      <div className="flex gap-1" role="group" aria-labelledby={labelId}>
        <Input aria-label={label} inputMode="decimal" className={cn(small, "w-20 min-w-0")} value={value} disabled={readOnly} aria-invalid={invalid} onChange={(e) => onValue(e.target.value)} />
        <Select value={unit} disabled={readOnly} onValueChange={(v) => onUnit(v as LoadUnit)}>
          <SelectTrigger aria-label={messages.plans.items.loadUnit} className="w-16 shrink-0 text-[13px] data-[size=default]:h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOAD_UNITS.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/** Botão "Mais opções (n)" que mostra/esconde uma região. */
export function MoreToggle({ open, count, controls, label, onToggle }: { open: boolean; count: number; controls: string; label?: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      aria-label={label}
      onClick={onToggle}
      className="inline-flex w-fit items-center gap-1 rounded text-[12px] font-medium text-brand-700 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <ChevronDown aria-hidden className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      {messages.plans.more.label}
      {count > 0 && <span className="text-ink-3">({count})</span>}
    </button>
  );
}
