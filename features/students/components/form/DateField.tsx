"use client";

import { CalendarDays } from "lucide-react";
import { ptBR } from "react-day-picker/locale";
import { useState } from "react";
import { isoToBR, isoToLocalDate, localDateToISO, maskBRDate, parseBRDate } from "@/lib/dates";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DateFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  /** Limites do calendário (aaaa-mm-dd). */
  min?: string;
  max?: string;
  describedBy?: string;
}

/** Data em dd/mm/aaaa: digitação com máscara + calendário. */
export function DateField({ id, value, onChange, onBlur, invalid, min, max, describedBy }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const iso = parseBRDate(value);
  const selected = iso ? isoToLocalDate(iso) : undefined;
  const startYear = min ? Number(min.slice(0, 4)) : 1920;
  const endYear = max ? Number(max.slice(0, 4)) : new Date().getFullYear() + 5;

  return (
    <div className="flex gap-2">
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        placeholder={messages.studentForm.datePlaceholder}
        value={value}
        onChange={(e) => onChange(maskBRDate(e.target.value))}
        onBlur={onBlur}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        maxLength={10}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="icon" aria-label={messages.studentForm.openCalendar}>
            <CalendarDays aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            locale={ptBR}
            captionLayout="dropdown"
            selected={selected}
            defaultMonth={selected ?? (max ? isoToLocalDate(max) : undefined)}
            startMonth={new Date(startYear, 0)}
            endMonth={new Date(endYear, 11)}
            disabled={[
              ...(min ? [{ before: isoToLocalDate(min) }] : []),
              ...(max ? [{ after: isoToLocalDate(max) }] : []),
            ]}
            onSelect={(date) => {
              if (date) onChange(isoToBR(localDateToISO(date)));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
